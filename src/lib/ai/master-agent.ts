/**
 * Maestro inside QAMUZ MASTER PRO: import, style, master, download.
 */

import { masterSession } from '$lib/stores/master.svelte';
import type { MasterStyle } from '$lib/audio/mastering';

export async function runMasterAgent(text: string): Promise<string> {
  const t = text.trim().toLowerCase();

  if (/\b(import|sube|cargar|abre).*(audio|canci|mix|wav|mp3)/.test(t) || /^(importar|subir audio)$/.test(t)) {
    return 'Usa el formulario de la izquierda: arrastra un WAV/MP3, elige una canción de tu librería o pulsa “Usar mix del arrange”.';
  }

  if (/\b(arrange|mezcla del daw|mix del arrange|bounce)\b/.test(t)) {
    await masterSession.loadArrangeMix();
    return masterSession.error || `Listo: ${masterSession.sourceName}. Pulsa Master o dime “masteriza”.`;
  }

  if (/\b(q-?warm|calid)/.test(t)) {
    masterSession.setStyle('qwarm');
    return 'Estilo Q-Warm.';
  }
  if (/\b(q-?open|abiert)/.test(t)) {
    masterSession.setStyle('qopen');
    return 'Estilo Q-Open.';
  }
  if (/\b(q-?balance|equilibr)/.test(t)) {
    masterSession.setStyle('qbalance');
    return 'Estilo Q-Balance.';
  }

  const knob = t.match(/\b(low|mid|high|presence|de-?esser|compression|character|saturation|loudness|width|trim)\b.*?(\d+(?:\.\d+)?)/);
  if (knob) {
    const field = knob[1];
    const raw = Number(knob[2]);
    const value = raw > 1 ? raw / 100 : raw;
    const recipe = { ...masterSession.recipe };
    if (field === 'low') recipe.eqLow = value;
    else if (field === 'mid') recipe.eqMid = value;
    else if (field === 'high') recipe.eqHigh = value;
    else if (field === 'presence') recipe.presence = value;
    else if (field.startsWith('de')) recipe.deEsser = value;
    else if (field === 'compression') recipe.compression = value;
    else if (field === 'character') recipe.character = value;
    else if (field === 'saturation') recipe.saturation = value;
    else if (field === 'loudness') recipe.loudness = value;
    else if (field === 'width') recipe.stereoWidth = value;
    else if (field === 'trim') recipe.inputTrimDb = raw > 12 ? 12 : raw;
    masterSession.recipe = recipe;
    masterSession.reprocess();
    return `Ajusté ${field}.`;
  }

  if (/\b(masteriz|analiza|master now|haz el master|render master)\b/.test(t) || t === 'master') {
    await masterSession.master();
    if (masterSession.error) return masterSession.error;
    const lufs = masterSession.wetReport?.lufs?.toFixed(1) ?? '—';
    return `Master listo (${lufs} LUFS). Quedó en el historial para descargar.`;
  }

  if (/\b(descarg|download|wav)\b/.test(t)) {
    masterSession.downloadCurrent();
    return masterSession.wet ? 'Descargando el WAV masterizado.' : 'Todavía no hay un master. Importa audio y pulsa Master.';
  }

  if (/\b(historial|history|descargas)\b/.test(t)) {
    const count = masterSession.history.length;
    return count
      ? `Hay ${count} master(s) en el historial de la izquierda. Pulsa cualquiera para descargarlo.`
      : 'El historial está vacío. Masteriza una canción y se guarda en la base de datos de QAMUZ AI.';
  }

  const styleHint = masterSession.recipe.style as MasterStyle;
  if (!masterSession.hasSource) {
    return 'Soy el agente de QAMUZ MASTER PRO. Primero importa el audio (formulario a la izquierda o “usar el mix del arrange”). Luego puedo cambiar Q-Warm / Q-Balance / Q-Open, EQ, dinámica y masterizar.';
  }

  return `Audio cargado: ${masterSession.sourceName}. Estilo ${styleHint}. Dime “masteriza”, un estilo, o un knob (ej. “loudness 0.7”).`;
}
