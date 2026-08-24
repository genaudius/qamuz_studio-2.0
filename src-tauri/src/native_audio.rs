//! Native audio host: cpal device enumeration now, a WASAPI/CoreAudio mixer
//! and VST3 hosting next.
//!
//! cpal's `Stream` is not `Send` on every platform, so it lives on a dedicated
//! audio thread. Tauri only holds a channel, which is `Send + Sync`.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::thread;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_output: bool,
    pub is_default: bool,
    pub max_channels: u16,
    pub sample_rate: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBackendStatus {
    pub available: bool,
    pub host: String,
    pub stream_running: bool,
    pub vst3_ready: bool,
    pub message: String,
}

enum Command {
    Start(Sender<Result<String, String>>),
    Stop(Sender<Result<(), String>>),
    Status(Sender<bool>),
}

pub struct NativeAudioHost {
    tx: Mutex<Sender<Command>>,
}

impl NativeAudioHost {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<Command>();

        thread::Builder::new()
            .name("qamuz-native-audio".into())
            .spawn(move || {
                let mut stream: Option<cpal::Stream> = None;

                while let Ok(command) = rx.recv() {
                    match command {
                        Command::Start(reply) => {
                            let result = start_stream(&mut stream);
                            let _ = reply.send(result);
                        }
                        Command::Stop(reply) => {
                            stream = None;
                            let _ = reply.send(Ok(()));
                        }
                        Command::Status(reply) => {
                            let _ = reply.send(stream.is_some());
                        }
                    }
                }
            })
            .expect("failed to spawn native audio thread");

        Self {
            tx: Mutex::new(tx),
        }
    }

    fn send(&self, command: Command) -> Result<(), String> {
        self.tx
            .lock()
            .map_err(|_| "Native audio lock was poisoned".to_string())?
            .send(command)
            .map_err(|_| "Native audio thread is gone".to_string())
    }
}

fn start_stream(slot: &mut Option<cpal::Stream>) -> Result<String, String> {
    if slot.is_some() {
        return Ok("Native output stream already running".into());
    }

    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| "No default output device".to_string())?;
    let name = device.name().unwrap_or_else(|_| "Default output".into());
    let config = device
        .default_output_config()
        .map_err(|e| format!("No output config: {e}"))?;

    let stream = device
        .build_output_stream(
            &config.config(),
            move |data: &mut [f32], _| {
                for sample in data.iter_mut() {
                    *sample = 0.0;
                }
            },
            |err| eprintln!("[native-audio] stream error: {err}"),
            None,
        )
        .map_err(|e| format!("Could not open output stream: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("Could not start output stream: {e}"))?;
    *slot = Some(stream);

    Ok(format!("Opened silent cpal stream on {name}"))
}

fn collect_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_out = host.default_output_device().and_then(|d| d.name().ok());
    let default_in = host.default_input_device().and_then(|d| d.name().ok());

    let mut devices = Vec::new();

    let outputs = host
        .output_devices()
        .map_err(|e| format!("Could not list output devices: {e}"))?;
    for (index, device) in outputs.enumerate() {
        let name = device.name().unwrap_or_else(|_| format!("Output {index}"));
        let config = device.default_output_config().ok();
        devices.push(AudioDeviceInfo {
            id: format!("out:{index}:{name}"),
            name: name.clone(),
            is_output: true,
            is_default: default_out.as_deref() == Some(name.as_str()),
            max_channels: config.as_ref().map(|c| c.channels()).unwrap_or(2),
            sample_rate: config
                .as_ref()
                .map(|c| c.sample_rate().0)
                .unwrap_or(48_000),
        });
    }

    if let Ok(inputs) = host.input_devices() {
        for (index, device) in inputs.enumerate() {
            let name = device.name().unwrap_or_else(|_| format!("Input {index}"));
            let config = device.default_input_config().ok();
            devices.push(AudioDeviceInfo {
                id: format!("in:{index}:{name}"),
                name: name.clone(),
                is_output: false,
                is_default: default_in.as_deref() == Some(name.as_str()),
                max_channels: config.as_ref().map(|c| c.channels()).unwrap_or(2),
                sample_rate: config
                    .as_ref()
                    .map(|c| c.sample_rate().0)
                    .unwrap_or(48_000),
            });
        }
    }

    Ok(devices)
}

#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    collect_devices()
}

#[tauri::command]
pub fn native_audio_status(host: tauri::State<NativeAudioHost>) -> NativeBackendStatus {
    let (tx, rx) = mpsc::channel();
    let running = host
        .send(Command::Status(tx))
        .ok()
        .and_then(|_| rx.recv().ok())
        .unwrap_or(false);
    let cpal_host = cpal::default_host();

    NativeBackendStatus {
        available: true,
        host: format!("{:?}", cpal_host.id()),
        stream_running: running,
        vst3_ready: false,
        message: if running {
            "cpal output stream is open. Mixer and VST3 hosting are the next native-engine pass."
                .into()
        } else {
            "Device enumeration is live. Start the native stream to claim the default output."
                .into()
        },
    }
}

#[tauri::command]
pub fn start_native_output_stream(host: tauri::State<NativeAudioHost>) -> Result<String, String> {
    let (tx, rx) = mpsc::channel();
    host.send(Command::Start(tx))?;
    rx.recv()
        .map_err(|_| "Native audio thread did not reply".to_string())?
}

#[tauri::command]
pub fn stop_native_output_stream(host: tauri::State<NativeAudioHost>) -> Result<(), String> {
    let (tx, rx) = mpsc::channel();
    host.send(Command::Stop(tx))?;
    rx.recv()
        .map_err(|_| "Native audio thread did not reply".to_string())?
}

#[cfg(test)]
mod tests {
    #[test]
    fn lists_at_least_the_default_host() {
        let host = cpal::default_host();
        assert!(!format!("{:?}", host.id()).is_empty());
    }
}
