/**
 * Studio map: one help catalog for the overlay and for Maestro,
 * so a user who does not know the layout can ask in Spanish.
 */

export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  body: string;
  keywords: string[];
  ask: string;
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'map',
    title: 'Mapa de QAMUZ Studio',
    summary: 'Sesión → Arrange / Maestro → Mixer / Piano / V-Rack → MASTER PRO → Export.',
    keywords: ['mapa', 'sistema', 'studio', 'daw', 'donde estoy', 'como se usa', 'como funciona', 'tour'],
    ask: 'Explícame el mapa de QAMUZ Studio',
    body: `QAMUZ Studio es el DAW. El chat de la derecha es Maestro, tu asistente.

Izquierda (menú):
• Sesión: Home, Nuevo, Abrir, Guardar
• Crear: Arrange (pistas), Importar stems, Maestro (chat), Inspector, Audio/MIDI
• Mezcla: Mixer, Piano, V-Rack
• Entrega: MASTER PRO y Export

Maestro ve lo que tienes seleccionado y si las pistas están vacías. Pregúntale cualquier duda: “qué es el mixer”, “cómo borro un track”, “cuál es la diferencia entre Enviar y Crear”.`
  },
  {
    id: 'send-create',
    title: 'Enviar vs Crear',
    summary: 'Enviar habla con Maestro. Crear pide la canción completa a GenAudius.',
    keywords: [
      'enviar',
      'crear',
      'boton',
      'botón',
      'genaudius',
      'chat',
      'diferencia',
      'cual boton',
      'cuál botón'
    ],
    ask: 'Explícame la diferencia entre Enviar y Crear',
    body: `Enviar (el botón de siempre):
Le hablas a Maestro. Edita la sesión: agrega un bajo, mezcla, mutea, borra un track (con aviso), cambia el tempo, marca intro/coro. No genera una canción nueva.

Crear:
Pide a GenAudius la canción completa a partir de una idea. Solo úsalo cuando quieras un tema nuevo renderizado. Si GenAudius está offline, Crear no puede inventar el audio.

Si tienes duda, escribe en el chat y pulsa Enviar. Ejemplo: “vamos a hacer un arreglo en MIDI” o “ayuda”.`
  },
  {
    id: 'midi-model',
    title: 'Arreglo MIDI vs GenAudius',
    summary: 'MIDI escribe notas en el DAW. Crear pide la canción al modelo que estás entrenando.',
    keywords: ['midi', 'arreglo', 'modelo', 'genaudius', 'ficha', 'adoctrina', 'instrumento'],
    ask: 'Explícame arreglo MIDI y GenAudius',
    body: `Dos modos. Dile a Maestro cuál:

Arreglo MIDI — “vamos a hacer un arreglo en MIDI”
Escribe bajo, bongó, requinto nota a nota. Las toca el synth interno del DAW. GenAudius no entra.

GenAudius — “esto lo compone GenAudius” o el botón Crear
La canción sale del modelo. No escribe MIDI de práctica.

Fichas — “adoctrina el bajo a bachata bailable”
Es la receta de ese instrumento (groove, BPM, tags). Hoy el MIDI de práctica sigue esa ficha; los ejemplos reales se guardan para entrenar el modelo.`
  },
  {
    id: 'maestro',
    title: 'Hablar con Maestro',
    summary: 'Dile la acción en español. Conoce la pista seleccionada y pregunta antes de borrar.',
    keywords: ['maestro', 'asistente', 'chat', 'agente', 'preguntar'],
    ask: 'Cómo le hablo a Maestro',
    body: `Abre Maestro en el menú o el icono de chispas del transport. Escribe en español y pulsa Enviar.

Puede:
• Detectar pistas vacías y proponerte un instrumento
• Armar una bachata por capas (bajo, bongó, segunda, requinto)
• Preguntar BPM y estilo antes de escribir
• Mezclar, mutear, duplicar, deshacer
• Pedir confirmación al borrar (“¿borrar el track del bajo?”)
• Borrador de letra y pista Voz

La voz cantada completa la monta GenAudius o una grabación. Si no sabes qué hacer, escribe “ayuda”.`
  },
  {
    id: 'arrange',
    title: 'Arrange, pistas y clips',
    summary: 'El arrange es el lienzo. Un clic en el lane o el clip selecciona la pista.',
    keywords: ['arrange', 'pista', 'track', 'clip', 'lane', 'seleccion', 'selección', 'importar', 'stems', 'arrastrar', 'carpeta'],
    ask: 'Cómo funciona el arrange',
    body: `El arrange es donde viven las pistas (Audio 1, Midi 1, Bajo…).

La línea de tiempo no tiene final: los compases siguen a la derecha (el clon 1.0 se paraba a 64 beats). Play no corta la canción al borde del lienzo.

• Clic en el nombre o en un clip: Maestro ya sabe cuál es “este track”
• Doble clic en un lane MIDI: región vacía
• Importar stems: elige los WAV/MP3 (se ven los archivos). Carpeta si quieres toda la carpeta. O arrastra
• Después de importar: Play escucha. La forma de onda y el pico en dB se ven en la pista
• Nueva pista (abajo a la izquierda): audio estéreo, MIDI, instrumento virtual, auxiliar o bus
• Borrar pista: el icono de papelera en el encabezado, clic derecho, o Delete si no hay clip seleccionado
• Doble clic en el nombre de arriba para el título
• Archivo a pista: un WAV/MP3 sobre la pista seleccionada
• Fill: arrastra una región para que Maestro reescriba esos beats
• Arrastra en el lane para seleccionar hasta el final y bounce en Export

Los stems deben estar alineados en el tiempo. Después de importar, pon el BPM de la canción en el transport.

Si las pistas existen pero no tienen audio ni MIDI, Maestro dice que están vacías y pregunta qué instrumento crear.`
  },
  {
    id: 'mix',
    title: 'Mixer',
    summary: 'Faders, pan, mute y solo de cada pista.',
    keywords: ['mixer', 'mezcla', 'fader', 'volumen', 'pan', 'mute', 'solo', 'db', 'metro', 'medidor', 'pico'],
    ask: 'Qué es el mixer',
    body: `El Mixer está abajo o en el menú Mezcla. Cada canal es una pista: volumen, pan, mute (M) y solo (S). El número verde es el pico en dB; el otro es la ganancia del fader.

También puedes decirle a Maestro: “mézclame suave”, “sube la voz”, “mutea el bajo”. La mezcla queda en los faders; no se pone a sonar sola hasta que des play.`
  },
  {
    id: 'piano',
    title: 'Piano roll',
    summary: 'Notas MIDI de la pista seleccionada.',
    keywords: ['piano', 'roll', 'midi', 'notas', 'teclado'],
    ask: 'Qué es el piano roll',
    body: `El Piano abre el editor de notas de la pista MIDI seleccionada. Ahí ves lo que Maestro escribió (bajo, requinto, etc.).

La parrilla no tiene final: puedes seguir a la derecha y dibujar. Si una nota pasa del clip, el clip se alarga.

Puedes dibujar, mover y borrar notas. Si la pista está vacía, crea un clip MIDI primero o pídele a Maestro el instrumento.`
  },
  {
    id: 'vrack',
    title: 'V-Rack',
    summary: 'Instrumentos internos de QAMUZ (bajo, piano, pluck…). No es AU/VST3 de terceros.',
    keywords: ['vrack', 'v-rack', 'instrumento', 'plugin', 'vst', 'au'],
    ask: 'Qué es el V-Rack',
    body: `V-Rack es el rack de instrumentos internos (Analog Bass, Grand Piano, Pluck, pad…). QAMUZ Studio no finge plugins AU/VST3 de otros fabricantes.

Maestro asigna el sonido al escribir una parte: el bajo usa el bajo virtual, el requinto un lead, los bongós la batería interna.`
  },
  {
    id: 'master',
    title: 'QAMUZ MASTER PRO',
    summary: 'Master de la canción cuando tú lo pidas: Q-Warm, Q-Balance, Q-Open.',
    keywords: ['master', 'mastering', 'master pro', 'loudness', 'q-warm'],
    ask: 'Cómo masterizo',
    body: `MASTER PRO está en Entrega. Maestro no masteriza solo: abre el módulo y espera el estilo (Q-Warm, Q-Balance, Q-Open) o el loudness.

Úsalo cuando la mezcla ya esté. Luego Export para WAV o MP3.`
  },
  {
    id: 'export',
    title: 'Exportar',
    summary: 'WAV o MP3 cuando la canción esté lista. No publica solo.',
    keywords: ['export', 'exportar', 'descargar', 'wav', 'mp3', 'publicar'],
    ask: 'Cómo exporto',
    body: `Export está en Entrega. Bounce a WAV (sin pérdida) o MP3 320 kbps. “Seleccionar hasta el final” marca toda la canción (por ejemplo 3 minutos) y luego Bounce. La línea de tiempo sigue abierta; el archivo termina en el último clip, no en silencio infinito.`
  },
  {
    id: 'session',
    title: 'Abrir y guardar',
    summary: 'Guardar elige QAMUZ (base de datos) o una carpeta tipo Pro Tools en tu computadora.',
    keywords: ['abrir', 'guardar', 'sesion', 'sesión', 'proyecto', 'nuevo', 'qamuzsess', 'pro tools', 'logic'],
    ask: 'Cómo abro y guardo',
    body: `Nuevo: idea de canción y nombre de sesión.
Abrir (Cmd/Ctrl+O): sesiones en QAMUZ, recientes, .qamuzsess, .dawproj o project.json.

Guardar (Cmd/Ctrl+S) te pregunta:
• En QAMUZ — IndexedDB. Audio, MIDI y mixer quedan en Abrir. Ahí se arma el material para entrenar.
• En esta computadora — carpeta tipo Pro Tools: archivo maestro .qamuzsess, Audio Files, MIDI Files e Interchange. QAMUZ abre el .qamuzsess y recupera todo. Pro Tools, Logic u otra DAW importan los WAV y MIDI (no un .ptx nativo: ese formato es de Avid).

El autoguardado escribe en QAMUZ cada dos minutos.

Home vuelve a QAMUZ AI (qamuz.ai), que es el SaaS, no el DAW.`
  },
  {
    id: 'fill',
    title: 'Generative Fill',
    summary: 'Marca beats en un lane y pide un cambio de frase o instrumento.',
    keywords: ['fill', 'generative', 'region', 'región', 'beats'],
    ask: 'Qué es Generative Fill',
    body: `Activa Fill, arrastra sobre el lane (los clips dejan pasar el gesto) y dile a Maestro qué poner en esos beats. También puedes hacer clic en un clip para seleccionar pista y rango.

No hace falta Fill para “agrega un bajo”: Maestro usa la sección o todo el track.`
  },
  {
    id: 'credits',
    title: 'Saldo y GenAudius',
    summary: 'Mezclar y extraer stems gastan créditos. Crear la canción necesita GenAudius en línea.',
    keywords: ['saldo', 'credito', 'crédito', 'credits', 'offline', 'genaudius'],
    ask: 'Cómo funcionan el saldo y GenAudius',
    body: `El motor de canción es GenAudius (a menudo el puerto 42003). Si Maestro dice offline, igual puedes editar, mezclar en local y escribir MIDI.

Los créditos se usan al mezclar, extraer stems o crear/renderizar. Si el saldo está bajo, Maestro te avisa. Recarga en la cuenta de QAMUZ AI.`
  }
];

export function foldHelp(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function wantsHelp(text: string): boolean {
  const t = foldHelp(text);
  if (/\b(mezcl|borra|mutea|agrega|anade|añade|sube|baja el volumen)\b/.test(t)) return false;
  return (
    /^(ayuda|help|duda|mapa)\b/.test(t) ||
    /\b(mapa del|como se usa|como funciona|como uso|tengo (una )?duda|no entiendo|que boton|que botón|explica)\b/.test(t) ||
    /\b(que es|qué es|para que sirve|para qué sirve|explicame|explícame|diferencia entre)\b/.test(t) ||
    /\b(enviar|crear)\b/.test(t) && /\b(boton|botón|cual|cuál|o crear|o enviar)\b/.test(t)
  );
}

export function matchHelpTopic(text: string): HelpTopic | null {
  const t = foldHelp(text);
  if (/\b(enviar|crear)\b/.test(t) && /\b(enviar|crear|boton|botón|diferencia|genaudius)\b/.test(t)) {
    return HELP_TOPICS.find((topic) => topic.id === 'send-create') ?? null;
  }
  let best: { topic: HelpTopic; score: number } | null = null;
  for (const topic of HELP_TOPICS) {
    const score = topic.keywords.reduce((sum, word) => (t.includes(foldHelp(word)) ? sum + 1 : sum), 0);
    if (
      score &&
      (!best || score > best.score || (score === best.score && best.topic.id === 'map' && topic.id !== 'map'))
    ) {
      best = { topic, score };
    }
  }
  return best && best.score > 0 ? best.topic : null;
}

export function helpOverview(): string {
  return `Mapa rápido de QAMUZ Studio:

1. Arrange = pistas y clips
2. Maestro = el chat. Enviar = arreglo MIDI. Crear = canción de GenAudius.
3. Mixer / Piano / V-Rack = mezcla e instrumentos
4. MASTER PRO / Export = master y descarga

Si tienes duda, pregúntame (“qué es el mixer”, “cómo borro un track”) o abre Ayuda (F1).`;
}

export function helpActions(): { id: string; label: string; prompt: string }[] {
  return [
    { id: 'help_send-create', label: 'Enviar vs Crear', prompt: 'Explícame la diferencia entre Enviar y Crear' },
    { id: 'help_midi-model', label: 'MIDI vs GenAudius', prompt: 'Explícame arreglo MIDI y GenAudius' },
    { id: 'help_map', label: 'Mapa del DAW', prompt: 'Explícame el mapa de QAMUZ Studio' },
    { id: 'help_maestro', label: 'Hablar con Maestro', prompt: 'Cómo le hablo a Maestro' },
    { id: 'help_arrange', label: 'Arrange', prompt: 'Cómo funciona el arrange' }
  ];
}

export function helpReply(text: string): { message: string; chips: string[]; actions: ReturnType<typeof helpActions> } {
  const topic = matchHelpTopic(text);
  if (topic && topic.id !== 'map') {
    return {
      message: `${topic.title}\n\n${topic.body}`,
      chips: ['Ayuda', topic.title],
      actions: helpActions()
    };
  }
  const map = HELP_TOPICS[0];
  return {
    message: `${helpOverview()}\n\n${map.body}`,
    chips: ['Ayuda', 'Mapa'],
    actions: helpActions()
  };
}
