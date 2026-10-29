/**
 * onda-audio.ts — il suono dell'onda energetica, sintetizzato al momento.
 *
 * Nessun file audio e nessuna libreria: tutto è prodotto dalla Web Audio API del browser con
 * oscillatori, rumore e filtri. Per questo la CSP del sito non cambia (non si scarica niente), il
 * suono pesa zero byte, e soprattutto **può seguire la carica passo passo**: un file registrato
 * dura quanto dura, mentre qui l'intonazione, la luminosità e il battito dipendono da quanto la
 * posa è stata tenuta (da 0 a 1).
 *
 * L'idea, in quattro strati:
 *
 *  1. **La carica** è un ronzio basso (due dente-di-sega leggermente stonate e un sub) che *sale*:
 *     l'altezza raddoppia circa, il filtro si apre da cupo a brillante, e un **battito** (un LFO sul
 *     volume) che da un cuore tranquillo accelera fino a un tremito. Sotto, un soffio di rumore che
 *     «risucchia» (un passa-banda che sale) e in cima un cristallino che vibra sempre più in fretta.
 *     Il crescendo è la promessa: ogni secondo di posa tenuta si sente.
 *  2. **Lo sparo** è un colpo: un sub che cade di 120 Hz in pochi decimi (il «boom» nel petto), una
 *     sferzata di rumore che si chiude da acuta a cupa, e un crepitio secco. È l'unico momento
 *     davvero forte, e dura meno di un secondo.
 *  3. **Il raggio** è un ruggito continuo (due dente-di-sega a quinta più un quadro all'ottava
 *     sotto, schiacciati da un saturatore e un filtro) con un sibilo d'aria sopra. Segue la
 *     posizione del raggio: **il panning stereo** lo porta a sinistra o a destra dello schermo
 *     mentre si muovono le mani. Si spegne seguendo la coda visiva del raggio.
 *  4. **Lo spazio**: tutto passa in un riverbero breve (rumore con decadimento esponenziale), e
 *     il master è un compressore, perché lo sparo è tanto più forte della carica e senza freno
 *     farebbe saltare chi ha il volume alto.
 *
 * Se le mani spariscono la carica non si spegne in dissolvenza: **si strappa** (un fischio che
 * precipita), come la palla sullo schermo.
 *
 * Il modulo non sa niente di DOM né di tempo reale: riceve un `AudioContext` (o un
 * `OfflineAudioContext`, che serve a renderizzarlo senza altoparlanti e misurarlo) e un istante
 * `quando` in secondi del contesto. Così si può provare in modo ripetibile (`prova-suono.html`).
 */

const limita = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Fase della pagina, come in onda.ts. */
export type FaseSuono = "idle" | "carica" | "raggio" | "riposo";

/** Il volume generale: con il compressore dopo, 0,55 lascia aria al colpo dello sparo. */
const VOLUME = 0.55;

export class SuonoOnda {
  private readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private muto = false;

  // Strato 1: carica
  private readonly droneOsc: OscillatorNode[] = [];
  private readonly droneFiltro: BiquadFilterNode;
  private readonly lfoBattito: OscillatorNode;
  private readonly lfoProfondita: GainNode;
  private readonly livelloCarica: GainNode;
  private readonly soffioFiltro: BiquadFilterNode;
  private readonly soffio: GainNode;
  private readonly cristalloOsc: OscillatorNode;
  private readonly cristalloLfo: OscillatorNode;
  private readonly cristallo: GainNode;

  // Strato 3: raggio
  private readonly ruggitoOsc: OscillatorNode[] = [];
  private readonly ruggitoFiltro: BiquadFilterNode;
  private readonly ruggito: GainNode;
  private readonly sibilo: GainNode;
  private readonly pan: StereoPannerNode;

  private readonly rumore: AudioBuffer;
  private readonly sorgenti: AudioScheduledSourceNode[] = [];

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.rumore = this.creaRumore(2);

    // --- Master: volume → compressore → uscita, più il riverbero in parallelo ---
    this.master = ctx.createGain();
    this.master.gain.value = VOLUME;
    const compressore = ctx.createDynamicsCompressor();
    compressore.threshold.value = -16;
    compressore.knee.value = 12;
    compressore.ratio.value = 6;
    compressore.attack.value = 0.003;
    compressore.release.value = 0.25;
    this.master.connect(compressore);
    compressore.connect(ctx.destination);
    const riverbero = ctx.createConvolver();
    riverbero.buffer = this.creaImpulso(1.8);
    const riverberoLivello = ctx.createGain();
    riverberoLivello.gain.value = 0.22;
    this.master.connect(riverbero);
    riverbero.connect(riverberoLivello);
    riverberoLivello.connect(compressore);

    // --- Strato 1: la carica ---
    this.livelloCarica = ctx.createGain();
    this.livelloCarica.gain.value = 0;
    const battito = ctx.createGain();
    battito.gain.value = 0.65; // il battito si somma a questa base (vedi `lfoProfondita`)
    this.droneFiltro = ctx.createBiquadFilter();
    this.droneFiltro.type = "lowpass";
    this.droneFiltro.Q.value = 4;
    this.droneFiltro.frequency.value = 160;
    const mixDrone = ctx.createGain();
    mixDrone.gain.value = 0.5;
    for (const [tipo, freq, detune] of [
      ["sawtooth", 55, 0],
      ["sawtooth", 55, 9], // appena stonata: batte contro la prima e dà il «movimento»
      ["sine", 27.5, 0], // il sub, un'ottava sotto
    ] as const) {
      const o = ctx.createOscillator();
      o.type = tipo;
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(mixDrone);
      this.droneOsc.push(o);
      this.sorgenti.push(o);
    }
    mixDrone.connect(this.droneFiltro);
    this.droneFiltro.connect(battito);
    battito.connect(this.livelloCarica);
    this.livelloCarica.connect(this.master);

    // Il battito: un LFO che si somma al volume della carica.
    this.lfoBattito = ctx.createOscillator();
    this.lfoBattito.type = "sine";
    this.lfoBattito.frequency.value = 1.4;
    this.lfoProfondita = ctx.createGain();
    this.lfoProfondita.gain.value = 0.3;
    this.lfoBattito.connect(this.lfoProfondita);
    this.lfoProfondita.connect(battito.gain);
    this.sorgenti.push(this.lfoBattito);

    // Il soffio che risucchia: rumore passa-banda che sale.
    const soffioSrc = this.sorgenteRumore();
    this.soffioFiltro = ctx.createBiquadFilter();
    this.soffioFiltro.type = "bandpass";
    this.soffioFiltro.Q.value = 1.4;
    this.soffioFiltro.frequency.value = 500;
    this.soffio = ctx.createGain();
    this.soffio.gain.value = 0;
    soffioSrc.connect(this.soffioFiltro);
    this.soffioFiltro.connect(this.soffio);
    this.soffio.connect(this.master);

    // Il cristallino: un sinusoide acuto con tremolo sempre più rapido.
    this.cristalloOsc = ctx.createOscillator();
    this.cristalloOsc.type = "sine";
    this.cristalloOsc.frequency.value = 660;
    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.5;
    this.cristalloLfo = ctx.createOscillator();
    this.cristalloLfo.type = "sine";
    this.cristalloLfo.frequency.value = 4;
    const tremoloProfondita = ctx.createGain();
    tremoloProfondita.gain.value = 0.5;
    this.cristalloLfo.connect(tremoloProfondita);
    tremoloProfondita.connect(tremolo.gain);
    this.cristallo = ctx.createGain();
    this.cristallo.gain.value = 0;
    this.cristalloOsc.connect(tremolo);
    tremolo.connect(this.cristallo);
    this.cristallo.connect(this.master);
    this.sorgenti.push(this.cristalloOsc, this.cristalloLfo);

    // --- Strato 3: il raggio (in un suo pannello stereo) ---
    this.pan = ctx.createStereoPanner();
    this.pan.connect(this.master);
    this.ruggito = ctx.createGain();
    this.ruggito.gain.value = 0;
    this.ruggitoFiltro = ctx.createBiquadFilter();
    this.ruggitoFiltro.type = "lowpass";
    this.ruggitoFiltro.Q.value = 2;
    this.ruggitoFiltro.frequency.value = 700;
    // Un saturatore (tanh): arrotonda i picchi e aggiunge armoniche, il ruggito si «sporca».
    const saturatore = ctx.createWaveShaper();
    const curva = new Float32Array(1024);
    for (let i = 0; i < curva.length; i++) curva[i] = Math.tanh(((i / (curva.length - 1)) * 2 - 1) * 2.4);
    saturatore.curve = curva;
    const mixRuggito = ctx.createGain();
    mixRuggito.gain.value = 0.45;
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 6.5;
    const vibratoProfondita = ctx.createGain();
    vibratoProfondita.gain.value = 14; // cent
    vibrato.connect(vibratoProfondita);
    this.sorgenti.push(vibrato);
    for (const [tipo, freq] of [
      ["sawtooth", 82.4],
      ["sawtooth", 123.5], // la quinta sopra
      ["square", 41.2], // l'ottava sotto
    ] as const) {
      const o = ctx.createOscillator();
      o.type = tipo;
      o.frequency.value = freq;
      vibratoProfondita.connect(o.detune);
      o.connect(mixRuggito);
      this.ruggitoOsc.push(o);
      this.sorgenti.push(o);
    }
    mixRuggito.connect(saturatore);
    saturatore.connect(this.ruggitoFiltro);
    this.ruggitoFiltro.connect(this.ruggito);
    this.ruggito.connect(this.pan);

    const sibiloSrc = this.sorgenteRumore();
    const sibiloFiltro = ctx.createBiquadFilter();
    sibiloFiltro.type = "highpass";
    sibiloFiltro.frequency.value = 2600;
    this.sibilo = ctx.createGain();
    this.sibilo.gain.value = 0;
    sibiloSrc.connect(sibiloFiltro);
    sibiloFiltro.connect(this.sibilo);
    this.sibilo.connect(this.pan);

    for (const s of this.sorgenti) s.start(0);
  }

  // -----------------------------------------------------------------------------------------------
  // Controllo continuo: si chiama a ogni fotogramma
  // -----------------------------------------------------------------------------------------------

  /**
   * Porta i parametri dei due strati continui allo stato della pagina.
   *
   * @param carica 0..1, quanto la posa è stata tenuta
   * @param pan    -1 (tutto a sinistra dello schermo) … +1 (tutto a destra)
   * @param fraz   0..1, quanto del raggio è trascorso (serve a spegnerlo con la sua coda)
   */
  aggiorna(quando: number, fase: FaseSuono, carica: number, pan: number, fraz: number): void {
    const c = limita(carica, 0, 1);
    const inCarica = fase === "carica";

    // La carica: più alta, più luminosa, più veloce. Il quadrato sul filtro tiene cupo il primo
    // metà secondo e fa «aprire» il suono solo verso la fine, quando la tensione sale.
    // Il tetto è basso apposta (0,42): la carica deve crescere, ma lo sparo deve restare il momento più
    // forte. Misurato sul rendering: con 0,67 lo sparo (RMS 0,199) non superava la carica al massimo (0,213).
    const livello = inCarica ? 0.1 + 0.32 * Math.pow(c, 0.8) : 0;
    this.livelloCarica.gain.setTargetAtTime(livello, quando, inCarica ? 0.08 : 0.025);
    this.droneFiltro.frequency.setTargetAtTime(160 + 2600 * c * c, quando, 0.08);
    const freq = 55 * (1 + 1.1 * c);
    this.droneOsc[0].frequency.setTargetAtTime(freq, quando, 0.1);
    this.droneOsc[1].frequency.setTargetAtTime(freq, quando, 0.1);
    this.droneOsc[2].frequency.setTargetAtTime(freq / 2, quando, 0.1);
    this.lfoBattito.frequency.setTargetAtTime(1.3 + 7.5 * c, quando, 0.1);
    this.lfoProfondita.gain.setTargetAtTime(0.3 + 0.2 * c, quando, 0.1);

    this.soffio.gain.setTargetAtTime(inCarica ? 0.01 + 0.2 * Math.pow(c, 1.4) : 0, quando, inCarica ? 0.1 : 0.03);
    this.soffioFiltro.frequency.setTargetAtTime(500 + 3200 * c, quando, 0.1);
    this.cristallo.gain.setTargetAtTime(inCarica ? 0.1 * Math.pow(c, 1.6) : 0, quando, inCarica ? 0.1 : 0.03);
    this.cristalloOsc.frequency.setTargetAtTime(660 + 1500 * c, quando, 0.1);
    this.cristalloLfo.frequency.setTargetAtTime(4 + 16 * c, quando, 0.1);

    // Il raggio: pieno per tre quarti, poi si ritira con la sua coda (`fraz`^4).
    const inRaggio = fase === "raggio";
    const inviluppo = inRaggio ? 1 - Math.pow(limita(fraz, 0, 1), 4) : 0;
    this.ruggito.gain.setTargetAtTime(0.62 * inviluppo, quando, inRaggio ? 0.04 : 0.06);
    // Il sibilo d'aria è un velo: con 0,12 dominava lo spettro (centroide 7600 Hz, un sibilo e non un
    // ruggito), con 0,03 resta come brillantezza in cima.
    this.sibilo.gain.setTargetAtTime(0.03 * inviluppo, quando, 0.06);
    this.ruggitoFiltro.frequency.setTargetAtTime(900 + 900 * inviluppo, quando, 0.08);
    this.pan.pan.setTargetAtTime(limita(pan, -1, 1), quando, 0.06);
  }

  // -----------------------------------------------------------------------------------------------
  // Eventi: una volta sola ciascuno
  // -----------------------------------------------------------------------------------------------

  /** La posa è stata confermata e comincia la carica: un tintinnio breve, «la cosa si accende». */
  ping(quando: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(1040, quando);
    o.frequency.exponentialRampToValueAtTime(1560, quando + 0.12);
    g.gain.setValueAtTime(0.0001, quando);
    g.gain.exponentialRampToValueAtTime(0.14, quando + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + 0.22);
    o.connect(g);
    g.connect(this.master);
    o.start(quando);
    o.stop(quando + 0.25);
  }

  /** Lo sparo: il colpo. Sub che cade, sferzata di rumore che si chiude, crepitio secco. */
  spara(quando: number): void {
    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(150, quando);
    sub.frequency.exponentialRampToValueAtTime(32, quando + 0.8);
    subG.gain.setValueAtTime(0.0001, quando);
    subG.gain.exponentialRampToValueAtTime(1.0, quando + 0.01);
    subG.gain.exponentialRampToValueAtTime(0.0001, quando + 1.2);
    sub.connect(subG);
    subG.connect(this.master);
    sub.start(quando);
    sub.stop(quando + 1.3);

    const sferzata = this.ctx.createBufferSource();
    sferzata.buffer = this.rumore;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(9000, quando);
    lp.frequency.exponentialRampToValueAtTime(300, quando + 0.9);
    const sG = this.ctx.createGain();
    sG.gain.setValueAtTime(0.0001, quando);
    sG.gain.exponentialRampToValueAtTime(1.0, quando + 0.012);
    sG.gain.exponentialRampToValueAtTime(0.0001, quando + 1.0);
    sferzata.connect(lp);
    lp.connect(sG);
    sG.connect(this.master);
    sferzata.start(quando);
    sferzata.stop(quando + 1.1);

    const crepitio = this.ctx.createBufferSource();
    crepitio.buffer = this.rumore;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    const cG = this.ctx.createGain();
    cG.gain.setValueAtTime(0.5, quando);
    cG.gain.exponentialRampToValueAtTime(0.0001, quando + 0.09);
    crepitio.connect(hp);
    hp.connect(cG);
    cG.connect(this.master);
    crepitio.start(quando);
    crepitio.stop(quando + 0.12);
  }

  /** Le mani sono sparite: la palla si strappa. Un fischio che precipita e un soffio che si chiude. */
  sparisce(quando: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(520, quando);
    o.frequency.exponentialRampToValueAtTime(70, quando + 0.32);
    g.gain.setValueAtTime(0.13, quando);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + 0.34);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    o.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    o.start(quando);
    o.stop(quando + 0.4);

    const n = this.ctx.createBufferSource();
    n.buffer = this.rumore;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(3200, quando);
    bp.frequency.exponentialRampToValueAtTime(220, quando + 0.38);
    const nG = this.ctx.createGain();
    nG.gain.setValueAtTime(0.2, quando);
    nG.gain.exponentialRampToValueAtTime(0.0001, quando + 0.4);
    n.connect(bp);
    bp.connect(nG);
    nG.connect(this.master);
    n.start(quando);
    n.stop(quando + 0.45);
  }

  // -----------------------------------------------------------------------------------------------
  // Volume, stato e chiusura
  // -----------------------------------------------------------------------------------------------

  /** Muto/non muto: una breve rampa, perché un taglio secco fa «tac». */
  impostaMuto(muto: boolean, quando = this.ctx.currentTime): void {
    this.muto = muto;
    this.master.gain.setTargetAtTime(muto ? 0 : VOLUME, quando, 0.04);
  }

  get èMuto(): boolean {
    return this.muto;
  }

  /** I livelli correnti dei due strati, per i test (non sono dati di una persona). */
  livelli(): { carica: number; raggio: number } {
    return { carica: this.livelloCarica.gain.value, raggio: this.ruggito.gain.value };
  }

  /** Silenzio immediato di tutti gli strati continui (la camera si è spenta). */
  zittisci(quando = this.ctx.currentTime): void {
    for (const p of [this.livelloCarica.gain, this.soffio.gain, this.cristallo.gain, this.ruggito.gain, this.sibilo.gain]) {
      p.cancelScheduledValues(quando);
      p.setTargetAtTime(0, quando, 0.03);
    }
  }

  /** Ferma tutto e libera le risorse: dopo questa il modulo non si usa più. */
  fine(): void {
    for (const s of this.sorgenti) {
      try {
        s.stop();
      } catch {
        /* già fermato */
      }
    }
    this.master.disconnect();
  }

  // -----------------------------------------------------------------------------------------------
  // Utilità
  // -----------------------------------------------------------------------------------------------

  /** Rumore bianco, deterministico (un generatore a seme): due esecuzioni danno lo stesso suono. */
  private creaRumore(secondi: number): AudioBuffer {
    const n = Math.floor(this.ctx.sampleRate * secondi);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seme = 123456789;
    for (let i = 0; i < n; i++) {
      seme = (Math.imul(seme, 1664525) + 1013904223) | 0;
      d[i] = ((seme >>> 0) / 4294967296) * 2 - 1;
    }
    return buf;
  }

  /** Una sorgente di rumore in loop, già registrata fra quelle da avviare. */
  private sorgenteRumore(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.rumore;
    s.loop = true;
    this.sorgenti.push(s);
    return s;
  }

  /** La risposta all'impulso del riverbero: rumore stereo che decade in modo esponenziale. */
  private creaImpulso(secondi: number): AudioBuffer {
    const n = Math.floor(this.ctx.sampleRate * secondi);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    let seme = 987654321;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        seme = (Math.imul(seme, 1664525) + 1013904223) | 0;
        d[i] = (((seme >>> 0) / 4294967296) * 2 - 1) * Math.pow(1 - i / n, 3.2);
      }
    }
    return buf;
  }
}
