#!/usr/bin/env bash
# Crea due "webcam finte" per Chromium, a partire da immagini pubbliche dei test di MediaPipe:
#
#   hands.mjpeg  4 foto di una mano SINISTRA (vittoria, pollice su, indice in su, pugno) che si
#                spostano sullo sfondo → serve alla pagina della mano;
#   body.mjpeg   una persona in piedi, corpo intero, che oscilla da un lato all'altro
#                → serve alla pagina del corpo (gambe, busto, braccia, testa);
#   hand-far.mjpeg  la stessa foto di mano, ma piccola dentro il fotogramma (28% dell'altezza)
#                → serve a provare l'avviso «avvicina la mano»: è l'unico modo di avere una mano
#                  LONTANA, visto che tutte le foto di prova sono ravvicinate;
#   duel.mjpeg   due mani affiancate nello stesso fotogramma (pugno a sinistra, vittoria a
#                destra) → serve alla pagina della sfida: due giocatori, due mosse diverse;
#   onda.mjpeg   due mani aperte affiancate con i polsi vicini (pollici all'esterno) → serve alla
#                pagina dell'onda energetica: la posa da tenere per 4 secondi;
#   onda-lontane.mjpeg  le stesse mani, ma staccate → il negativo della stessa pagina;
#   body-hands.mjpeg  una persona ripresa da vicino con le due mani bene in vista
#                → serve a provare il secondo modello, quello delle mani: nella foto a corpo
#                  intero le mani sono piccole e mosse, e il riconoscitore non le trova (provato:
#                  zero mani a 520, 640, 800, 1000 e 1400 pixel di larghezza).
#
# Il formato MJPEG è quello che Chromium accetta con --use-file-for-fake-video-capture.
# Entrambi i file si creano una volta sola e restano in .cache/ (che non finisce nel repository).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .cache && cd .cache

scarica() { [ -s "$1.jpg" ] || curl -sfL -o "$1.jpg" "https://storage.googleapis.com/mediapipe-assets/$1.jpg"; }

# --- 1. La mano -----------------------------------------------------------------------------
for f in victory thumb_up pointing_up fist; do scarica "$f"; done
if [ -s hands.mjpeg ]; then
  echo "tests/e2e/.cache/hands.mjpeg già presente"
else
  # Ogni foto ha proporzioni sue: senza riportarle tutte alla stessa dimensione (scale+pad) e
  # allo stesso rapporto dei pixel (setsar=1), il montaggio in sequenza (concat) si rifiuta.
  P="scale=360:380:force_original_aspect_ratio=decrease,pad=360:380:(ow-iw)/2:(oh-ih)/2:color=0xd8d4cc,setsar=1,fps=30"
  ffmpeg -y -v error \
    -loop 1 -t 2.5 -i victory.jpg -loop 1 -t 2.5 -i thumb_up.jpg -loop 1 -t 2.5 -i pointing_up.jpg -loop 1 -t 2.5 -i fist.jpg \
    -f lavfi -i color=c=0xd8d4cc:s=640x480:r=30:d=10 \
    -filter_complex "[0]$P[a];[1]$P[b];[2]$P[c];[3]$P[d];[a][b][c][d]concat=n=4:v=1[h];[4][h]overlay=x='(W-w)/2+90*sin(t*1.6)':y='(H-h)/2+25*cos(t*1.3)':shortest=1,format=yuvj420p" \
    -c:v mjpeg -q:v 4 -f mjpeg hands.mjpeg
  echo "creato tests/e2e/.cache/hands.mjpeg"
fi

# --- 1-bis. La mano lontana -----------------------------------------------------------------
if [ -s hand-far.mjpeg ]; then
  echo "tests/e2e/.cache/hand-far.mjpeg già presente"
else
  # Una mano sola, ferma, alta il 28% del fotogramma: misurata, dà un palmo di ~0,093, cioè
  # ben sotto la soglia di 0,115 oltre la quale la pagina dice «avvicinati» (vedi src/main.ts).
  # Serve una foto RIMPICCIOLITA e non una ripresa da lontano perché è l'apparente dimensione
  # nell'immagine a contare, ed è esattamente ciò che cambia allontanandosi dalla camera.
  ffmpeg -y -v error \
    -loop 1 -t 6 -i victory.jpg \
    -vf "scale=-1:134,pad=640:480:(ow-iw)/2:(oh-ih)/2:color=0xd8d4cc,setsar=1,fps=30,format=yuvj420p" \
    -c:v mjpeg -q:v 4 -f mjpeg hand-far.mjpeg
  echo "creato tests/e2e/.cache/hand-far.mjpeg"
fi

# --- 1-ter. Il duello: due mani nello stesso fotogramma --------------------------------------
if [ -s duel.mjpeg ]; then
  echo "tests/e2e/.cache/duel.mjpeg già presente"
else
  # Due foto diverse affiancate: è l'unico modo di avere DUE GIOCATORI in un filmato finto, visto
  # che ogni foto di prova contiene una mano sola. Restano ferme apposta: al test serve un esito
  # prevedibile, non realismo.
  # Le due foto vanno RIMPICCIOLITE perché ci stiano entrambe: alla prima prova erano larghe
  # 400 px l'una in un fotogramma da 640 e si sovrapponevano, il pugno restava tagliato a metà e
  # il riconoscitore vedeva una mano sola.
  # Attenzione a chi è chi: la pagina specchia l'immagine, quindi la mano che qui sta a SINISTRA
  # del fotogramma compare a DESTRA sullo schermo, ed è il giocatore 2.
  ffmpeg -y -v error \
    -f lavfi -i color=c=0xd8d4cc:s=640x480:r=30:d=10 \
    -loop 1 -t 10 -i fist.jpg -loop 1 -t 10 -i victory.jpg \
    -filter_complex "[1]scale=280:400:force_original_aspect_ratio=decrease,setsar=1[a];[2]scale=280:400:force_original_aspect_ratio=decrease,setsar=1[b];[0][a]overlay=x=20:y=(H-h)/2:shortest=1[s];[s][b]overlay=x=W-w-20:y=(H-h)/2:shortest=1,format=yuvj420p" \
    -c:v mjpeg -q:v 4 -f mjpeg duel.mjpeg
  echo "creato tests/e2e/.cache/duel.mjpeg"
fi

# --- 1-quater. Mani aperte, una di palmo e una di dorso ---------------------------------------
if [ -s dorso.mjpeg ]; then
  echo "tests/e2e/.cache/dorso.mjpeg già presente"
else
  # right_hands.jpg ritrae due mani aperte nello stesso fotogramma: quella a sinistra è vista dal
  # DORSO (dita in giù), quella a destra dal PALMO. È l'unica foto di prova in cui la stessa mossa
  # compare girata di 180°, e serve a verificare che la sfida legga «carta» in entrambi i modi.
  ffmpeg -y -v error -loop 1 -t 10 -i right_hands.jpg \
    -vf "scale=640:-2,pad=640:480:(ow-iw)/2:(oh-ih)/2:color=0xd8d4cc,setsar=1,fps=30,format=yuvj420p" \
    -c:v mjpeg -q:v 4 -f mjpeg dorso.mjpeg
  echo "creato tests/e2e/.cache/dorso.mjpeg"
fi

# --- 1-quater. L'onda: due mani aperte, polsi vicini ----------------------------------------
# right_hands.jpg contiene DUE mani aperte ma lontane e capovolte una rispetto all'altra: serve la
# mano destra sola (a destra nella foto, dita in su). Se ne ritaglia una, si specchia per avere la
# gemella e le si affianca coi POLLICI ALL'ESTERNO (altrimenti i due pollici si sovrapporrebbero e
# il riconoscitore vedrebbe una mano sola, come già successo con le foto della sfida).
#
#   onda.mjpeg          polsi vicini            → la posa giusta (rapporto polsi/palmo ~1,0)
#   onda-lontane.mjpeg  le STESSE mani, staccate → il negativo che isola la distanza: aperte, nello
#                       stesso verso, soltanto più lontane (rapporto ~2,6). Con duel.mjpeg (pugno e
#                       vittoria) il test passerebbe anche se la soglia sulla distanza fosse rotta,
#                       perché lì mancano già le dita aperte.
scarica right_hands
# crop=285:382:380:0 → la mano destra intera, con il lato del mignolo tagliato corto (il margine
# bianco in più allontanerebbe i polsi); scale=-1:288 → alta il 60% del fotogramma (288 di 480);
# hflip → la gemella; pad → fotogramma 640×480 su bianco (come lo sfondo della foto: niente bordi).
MANO="crop=285:382:380:0,scale=-1:288,setsar=1"
if [ -s onda.mjpeg ]; then
  echo "tests/e2e/.cache/onda.mjpeg già presente"
else
  ffmpeg -y -v error -loop 1 -t 10 -i right_hands.jpg \
    -filter_complex "[0]$MANO,split[a][b];[b]hflip[c];[a][c]hstack,pad=640:480:(ow-iw)/2:130:color=white,fps=30,format=yuvj420p" \
    -c:v mjpeg -q:v 4 -f mjpeg onda.mjpeg
  echo "creato tests/e2e/.cache/onda.mjpeg"
fi
if [ -s onda-lontane.mjpeg ]; then
  echo "tests/e2e/.cache/onda-lontane.mjpeg già presente"
else
  ffmpeg -y -v error -loop 1 -t 10 -i right_hands.jpg -f lavfi -i color=c=white:s=160x288:r=30:d=10 \
    -filter_complex "[0]$MANO,split[a][b];[b]hflip[c];[a][1][c]hstack=inputs=3:shortest=1,pad=640:480:(ow-iw)/2:130:color=white,fps=30,format=yuvj420p" \
    -shortest -c:v mjpeg -q:v 4 -f mjpeg onda-lontane.mjpeg
  echo "creato tests/e2e/.cache/onda-lontane.mjpeg"
fi

# --- 1-quinquies. Il ventaglio: la posa vera dell'onda, con le mani aperte a ~90° -------------
# Chi prova la pagina non tiene le mani parallele: una ha le dita in su e l'altra di lato, a ventaglio,
# con i polsi uniti. Il filmato le compone dalle due mani aperte di right_hands.jpg (una specchiata e
# ruotata di 125°). `ventaglio.jpg` lo crea questo blocco; `ventaglio-mobile.mjpeg` lo fa scorrere da
# un lato all'altro, per verificare che il raggio segua le mani.
if [ ! -s ventaglio.mjpeg ]; then
  python3 - <<'PYEOF'
import numpy as np
from PIL import Image
im = Image.open("right_hands.jpg").convert("RGB"); W, H = im.size
mano = im.crop((380, 0, W, H)); mw, mh = mano.size
a = np.asarray(mano).astype(int); alfa = (a.min(axis=2) < 238).astype(np.uint8) * 255
mano = mano.convert("RGBA"); mano.putalpha(Image.fromarray(alfa))
sc = 270 / mh; mano = mano.resize((int(mw * sc), 270)); mw, mh = mano.size
polso = (mw // 2 + 20, mh - 4)
def strato(m, ang, cx, cy, specchia=False):
    if specchia: m = m.transpose(Image.FLIP_LEFT_RIGHT)
    p = (m.size[0] - polso[0], polso[1]) if specchia else polso
    L = Image.new("RGBA", (640, 480), (0, 0, 0, 0)); L.paste(m, (cx - p[0], cy - p[1]), m)
    return L.rotate(ang, resample=Image.BICUBIC, center=(cx, cy))
cx, cy = 330, 390
solo = Image.new("RGBA", (640, 480), (0, 0, 0, 0))
solo.alpha_composite(strato(mano, 8, cx, cy)); solo.alpha_composite(strato(mano, 125, cx - 6, cy, specchia=True))
solo.save("ventaglio-mani.png")
bg = Image.new("RGBA", (640, 480), (214, 208, 196, 255)); bg.alpha_composite(solo); bg.convert("RGB").save("ventaglio.jpg", quality=95)
PYEOF
  ffmpeg -y -v error -loop 1 -t 12 -i ventaglio.jpg -vf "scale=640:480,setsar=1,fps=30,format=yuvj420p" -c:v mjpeg -q:v 4 -f mjpeg ventaglio.mjpeg
  echo "creato tests/e2e/.cache/ventaglio.mjpeg"
fi
if [ ! -s ventaglio-mobile.mjpeg ]; then
  ffmpeg -y -v error -f lavfi -i color=c=0xd6d0c4:s=640x480:r=30:d=16 -loop 1 -t 16 -i ventaglio-mani.png \
    -filter_complex "[0][1]overlay=x='140*sin(t*0.9)':y='0':shortest=1,format=yuvj420p" \
    -c:v mjpeg -q:v 4 -f mjpeg ventaglio-mobile.mjpeg
  echo "creato tests/e2e/.cache/ventaglio-mobile.mjpeg"
fi

# --- 1-sexies. Il ventaglio che sparisce -----------------------------------------------------
# Le mani a ventaglio per 3 secondi, poi il fotogramma resta senza mani: serve a verificare che
# l'onda in carica SPARISCA subito quando le mani escono, invece di scendere piano.
if [ ! -s ventaglio-sparisce.mjpeg ]; then
  ffmpeg -y -v error -loop 1 -t 3 -i ventaglio.jpg -f lavfi -i color=c=0xd6d0c4:s=640x480:r=30:d=9 \
    -filter_complex "[0]scale=640:480,setsar=1,fps=30[a];[1]setsar=1,fps=30[b];[a][b]concat=n=2:v=1,format=yuvj420p" \
    -c:v mjpeg -q:v 4 -f mjpeg ventaglio-sparisce.mjpeg
  echo "creato tests/e2e/.cache/ventaglio-sparisce.mjpeg"
fi

# --- 2. Il corpo ----------------------------------------------------------------------------
scarica pose
if [ -s body.mjpeg ]; then
  echo "tests/e2e/.cache/body.mjpeg già presente"
else
  # La foto (1000×667, una persona in piedi con braccia e gambe ben visibili) viene rimpicciolita
  # e fatta oscillare: l'oscillazione è il punto, perché è così che il test verifica che il
  # movimento venga davvero seguito e non sia una posa congelata.
  ffmpeg -y -v error \
    -loop 1 -t 10 -i pose.jpg \
    -f lavfi -i color=c=0xd8d4cc:s=640x480:r=30:d=10 \
    -filter_complex "[0]scale=520:347,setsar=1,fps=30[p];[1][p]overlay=x='(W-w)/2+55*sin(t*1.4)':y='(H-h)/2+12*cos(t*1.1)':shortest=1,format=yuvj420p" \
    -c:v mjpeg -q:v 4 -f mjpeg body.mjpeg
  echo "creato tests/e2e/.cache/body.mjpeg"
fi

# --- 3. Il corpo con le mani in vista -------------------------------------------------------
scarica woman_hands
if [ -s body-hands.mjpeg ]; then
  echo "tests/e2e/.cache/body-hands.mjpeg già presente"
else
  # Formato verticale, come una webcam di un telefono: la persona riempie l'inquadratura e le
  # mani restano grandi abbastanza perché il riconoscitore le trovi.
  ffmpeg -y -v error \
    -loop 1 -t 10 -i woman_hands.jpg \
    -f lavfi -i color=c=0x101418:s=540x760:r=30:d=10 \
    -filter_complex "[0]scale=460:690,setsar=1,fps=30[p];[1][p]overlay=x='(W-w)/2+28*sin(t*1.3)':y='(H-h)/2+10*cos(t*1.1)':shortest=1,format=yuvj420p" \
    -c:v mjpeg -q:v 4 -f mjpeg body-hands.mjpeg
  echo "creato tests/e2e/.cache/body-hands.mjpeg"
fi
