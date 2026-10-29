# La mano al computer

**Alla fine del corso** ogni studente avrà scritto da solo un piccolo gioco che si comanda con la
mano davanti alla webcam: niente mouse, niente tastiera.

Per arrivarci bastano il C della scuola e un browser. Il riconoscimento della mano (trovare i
21 punti delle dita nell'immagine) lo fa una libreria già pronta; a noi resta la parte che si
programma con `if`, `for` e un po' di geometria.

## Le lezioni

Ogni lezione comincia dicendo **cosa avrai sullo schermo alla fine**. Se alla fine della lezione
lo vedi, la lezione è riuscita.

| # | Lezione | Cosa ottieni alla fine | Tempo |
|---|---|---|---|
| 1 | [I punti della mano](lezioni/01-punti-della-mano.md) | La tua webcam sullo schermo, con 21 pallini verdi che seguono la tua mano | 60 min |
| 2 | Quante dita? *(in preparazione)* | Un numero grande che dice quante dita stai alzando, da 0 a 5 | 60–90 min |
| 3 | Il gesto *(in preparazione)* | Una scritta che riconosce il gesto: 👍 pollice su, ✊ pugno, ✋ mano aperta | 60–90 min |
| 4 | Il bersaglio *(in preparazione)* | Un gioco: tocchi con l'indice i cerchi che compaiono, con punteggio e tempo | 90 min |
| 5 | Sasso, carta, forbici *(facoltativa)* | Una partita contro il computer, giocata con la mano | 90 min |

**Il minimo** sono le lezioni 1–3, circa 4 ore. **Il corso completo**, fino al gioco della
lezione 4, è di circa 5 ore e mezza.

## Cosa serve

- Un computer con **webcam** (va bene anche una webcam USB) e il browser **Chrome** o **Edge**.
- **Internet**: si lavora nell'editor online di p5.js, senza installare niente.
- Sapere cos'è una variabile, un `if`, un ciclo `for` e un array. Tutto il resto lo spieghiamo.

## Come si lavora

Si scrive il codice nell'**editor online di p5.js**: a sinistra il codice, a destra il risultato.
Si preme ▶ e il programma parte.

Gli strumenti sono due librerie:

- **p5.js**: per disegnare sullo schermo (cerchi, testo, l'immagine della webcam);
- **ml5.js**: per riconoscere la mano. Dentro c'è un modello di intelligenza artificiale di
  Google che, data un'immagine, trova i 21 punti della mano.

!!! note "Le immagini della webcam restano sul tuo computer"
    Il riconoscimento avviene dentro il browser. L'immagine della webcam non viene inviata a
    nessun server; dalla rete si scarica soltanto il modello, una volta, all'inizio.

## Per il docente: prova il laboratorio prima della lezione 1

Cinque minuti su **un** computer del laboratorio evitano la lezione persa:

1. Apri <https://mano.giuseppebosi.com/onda/> e premi «Accendi la camera».
2. Se il browser chiede il permesso per la webcam, concedilo.
3. Deve comparire la tua immagine. Metti le mani davanti: devono apparire i punti sulle dita.

| Cosa succede | Cosa vuol dire |
|---|---|
| Immagine e punti, fluidi | Il laboratorio è pronto |
| Immagine sì, ma molto a scatti | I PC sono lenti: funzionerà, ma conviene lavorare a coppie sui PC migliori |
| «Camera non trovata» | Il PC non ha webcam: serve una webcam USB |
| La webcam è bloccata | Il browser o la rete della scuola la vietano: va sentito il tecnico |
| La pagina non si apre | La rete della scuola filtra il sito: va sentito il tecnico |
