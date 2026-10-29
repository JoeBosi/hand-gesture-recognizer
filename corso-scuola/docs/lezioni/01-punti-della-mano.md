# Lezione 1 · I punti della mano

!!! success "Cosa ottieni alla fine di questa lezione"
    **La tua webcam sullo schermo, con 21 pallini verdi che seguono la tua mano.**
    Muovi la mano e i pallini la seguono; chiudi le dita e i pallini si chiudono con loro.

    ![Il risultato della lezione 1: una mano con il pollice alzato, coperta da 21 pallini verdi sulle dita e sul polso](../img/lezione-01-risultato.png){ width="480" }

    **Tempo:** 60 minuti · **Righe di codice:** circa 30 · **Ti serve:** PC con webcam, Chrome o Edge, internet

Il programma è uno solo e lo costruisci in tre passi:

1. **Farlo partire** (15 min): copi il codice nell'editor e lo vedi funzionare.
2. **Capirlo** (25 min): lo leggiamo riga per riga, confrontandolo con il C che conosci.
3. **Modificarlo** (20 min): tre esercizi, ognuno cambia una cosa che vedi sullo schermo.

---

## 1. Farlo partire

### Passo 1 — Apri l'editor

Vai su <https://editor.p5js.org/>. Si apre l'editor: **a sinistra il codice**, **a destra il
risultato** (per ora un quadrato grigio). Non serve registrarsi per provare.

### Passo 2 — Aggiungi la libreria che riconosce la mano

Il progetto ha più file. Per vederli, clicca la piccola freccia **›** in alto a sinistra, sopra il
codice: compare l'elenco dei file. Apri **`index.html`**.

Cerca la riga che carica p5.js (contiene `p5.js` o `p5.min.js`) e **subito sotto** aggiungi questa:

```html
<script src="https://unpkg.com/ml5@1.4.0/dist/ml5.js"></script>
```

Poi torna al file **`sketch.js`**.

!!! tip "Perché"
    È come un `#include` in C: senza questa riga il programma non sa cosa sia `ml5`.

### Passo 3 — Incolla il programma

In `sketch.js` cancella tutto e incolla questo (il pulsante in alto a destra del riquadro lo copia):

```javascript
--8<-- "codice/lezione-01.js"
```

### Passo 4 — Premi ▶

1. Premi **▶** (Play) in alto.
2. Il browser chiede il permesso di usare la **webcam**: concedilo.
3. Aspetta qualche secondo (il modello si sta scaricando) e metti la mano davanti alla webcam.

!!! success "Controllo"
    Vedi i pallini verdi sulla tua mano? **Il programma funziona.** Se no, guarda
    [Se non funziona](#se-non-funziona) in fondo alla pagina.

---

## 2. Capirlo

### Da C a JavaScript: le cinque differenze che servono oggi

Il programma è scritto in **JavaScript**, il linguaggio dei browser. È molto più vicino al C di
quanto sembri:

| In C | In JavaScript | Cosa cambia |
|---|---|---|
| `int x = 5;` | `let x = 5;` | Non si scrive il tipo: `let` va bene per numeri, testo, array |
| `void disegna() { ... }` | `function disegna() { ... }` | Al posto del tipo di ritorno si scrive `function` |
| `int v[21];` e la lunghezza la ricordi tu | `let v = [];` e `v.length` | L'array conosce la sua lunghezza e può crescere |
| `p.x` su una `struct` | `punto.x` su un oggetto | Uguale: si legge un campo con il punto |
| Il programma parte da `main()` | Partono da sole `setup()` e `draw()` | Vedi sotto |

### Niente `main`: `setup()` e `draw()`

Con p5.js non scrivi il `main`. Scrivi due funzioni, e p5.js le chiama al posto tuo:

```c
// è come se p5.js avesse scritto questo main per te:
int main() {
    setup();          // una volta sola, all'inizio
    while (1) {
        draw();       // per sempre, circa 60 volte al secondo
    }
}
```

- In **`setup()`** prepari le cose: la finestra, la webcam, il riconoscitore.
- In **`draw()`** disegni un fotogramma. Siccome viene chiamata di continuo, quello che disegni
  si aggiorna da solo: è così che i pallini seguono la mano.

### Le funzioni che vengono chiamate «quando è pronto»

Ci sono due funzioni che nessuno chiama esplicitamente: `modelloPronto` e `maniTrovate`. Le
passiamo per nome a ml5, e ml5 le chiama **quando ha finito un lavoro**:

- `ml5.handPose(modelloPronto)`: «scarica il modello e, quando hai finito, chiama `modelloPronto`»;
- `handPose.detectStart(video, maniTrovate)`: «guarda il video di continuo, e ogni volta che hai
  trovato le mani chiama `maniTrovate` con i risultati».

È lo stesso trucco dei puntatori a funzione in C: passi una funzione come argomento, e la
chiamerà qualcun altro al momento giusto.

### Cosa c'è dentro `mani`

`mani` è un **array di mani** (vuoto se non ce n'è nessuna, fino a due). Ogni mano ha un campo
`keypoints`, un **array di 21 punti**; ogni punto ha `x` e `y`, in pixel, come la finestra.

I punti sono sempre numerati nello stesso modo:

| Numero | Dove |
|---|---|
| 0 | il polso |
| 1 – 4 | il pollice, dalla base alla **punta (4)** |
| 5 – 8 | l'indice, dalla nocca alla **punta (8)** |
| 9 – 12 | il medio, **punta 12** |
| 13 – 16 | l'anulare, **punta 16** |
| 17 – 20 | il mignolo, **punta 20** |

Quindi `mano.keypoints[8].x` è la x della punta dell'indice. Questa tabella ti servirà in tutte le
prossime lezioni.

### I due `for` di `draw()`

```javascript
for (let i = 0; i < mani.length; i++) {              // per ogni mano...
  let mano = mani[i];
  for (let j = 0; j < mano.keypoints.length; j++) {  // ...per ognuno dei 21 punti
    let punto = mano.keypoints[j];
    circle(punto.x, punto.y, 10);                    // un pallino lì
  }
}
```

Sono due `for` uno dentro l'altro, esattamente come in C. L'unica novità è `.length` al posto di
una costante scritta a mano.

### Le funzioni di disegno di p5.js usate oggi

| Funzione | Cosa fa |
|---|---|
| `createCanvas(640, 480)` | Crea la finestra di disegno, 640 × 480 pixel. L'origine (0, 0) è **in alto a sinistra**, e la y cresce **verso il basso** |
| `image(video, 0, 0)` | Disegna l'immagine della webcam, a partire dall'angolo in alto a sinistra |
| `fill(r, g, b)` | Sceglie il colore di riempimento: rosso, verde, blu, da 0 a 255 |
| `noStroke()` | Niente bordo attorno alle figure |
| `circle(x, y, d)` | Un cerchio con centro (x, y) e diametro d |

!!! warning "L'immagine non è uno specchio"
    Se alzi la mano destra, sullo schermo la vedi a sinistra, come in una foto. È normale: per
    ora va benissimo così.

---

## 3. Modificarlo

Fai gli esercizi in ordine. Dopo ogni modifica premi **▶** e controlla che sullo schermo sia
successo quello che ti aspettavi.

### Esercizio 1 — Pallini rossi e più grandi

**Risultato:** i pallini diventano rossi e grandi il doppio.

??? example "Soluzione"
    Cambia le due righe dentro il secondo `for`:
    ```javascript
    fill(255, 0, 0);               // rosso
    circle(punto.x, punto.y, 20);  // diametro 20 invece di 10
    ```

### Esercizio 2 — Solo la punta dell'indice

**Risultato:** sullo schermo resta **un solo** pallino, grande e giallo, sulla punta dell'indice.

*Suggerimento:* la punta dell'indice è il punto numero 8. Non serve il secondo `for`.

??? example "Soluzione"
    Al posto del secondo `for`:
    ```javascript
    let punta = mano.keypoints[8];   // la punta dell'indice
    fill(255, 255, 0);               // giallo
    circle(punta.x, punta.y, 30);
    ```

### Esercizio 3 — Dove sta il dito?

**Risultato:** in alto a sinistra compaiono le coordinate della punta dell'indice, per esempio
`x = 312   y = 145`, e cambiano mentre muovi il dito.

*Suggerimento:* `text("ciao", 20, 40)` scrive «ciao» alla posizione (20, 40); `textSize(32)`
sceglie la grandezza. In JavaScript i testi si uniscono con `+`, e `round()` toglie i decimali.

??? example "Soluzione"
    Sotto il pallino giallo dell'esercizio 2:
    ```javascript
    fill(0);                         // nero: si legge anche su un muro chiaro
    textSize(32);
    text("x = " + round(punta.x) + "   y = " + round(punta.y), 20, 40);
    ```
    Prova a muovere il dito verso l'alto: la **y diminuisce**. Ricordatelo, servirà nella
    lezione 2 per capire se un dito è alzato.

---

## Se non funziona

| Cosa vedi | Cosa fare |
|---|---|
| Il quadrato resta grigio, niente webcam | Il browser non ha il permesso: clicca l'icona della webcam nella barra dell'indirizzo e consenti, poi premi ▶ di nuovo |
| La webcam si vede, ma niente pallini | Aspetta 10–20 secondi: alla prima volta il modello si sta scaricando. Poi controlla che la mano sia ben illuminata e intera nell'immagine |
| Sotto il codice c'è scritto `ml5 is not defined` | Manca la riga del passo 2 in `index.html`, o è scritta male |
| Un altro errore in rosso sotto il codice | Hai cancellato o cambiato un pezzo per sbaglio: incolla di nuovo il programma del passo 3 |

## La prossima lezione

**Lezione 2 · Quante dita?** Alla fine avrai sullo schermo un **numero grande che dice quante dita
stai alzando**, da 0 a 5. Userai un `if` per ogni dito: la punta sta più in alto della nocca?
