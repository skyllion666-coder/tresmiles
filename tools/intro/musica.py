#!/usr/bin/env python3
"""Música original de la introducción (síntesis propia, sin muestras de terceros): pad ambiental, campanitas,
brisa suave y un acorde final que resuelve. Salida: audio/intro.mp3 (≈16 s). Uso: musica.py [salida.mp3]"""
import sys, subprocess, numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
SR = 44100; DUR = 16.0; N = int(SR * DUR); rng = np.random.default_rng(7)
t = np.arange(N) / SR
f = lambda m: 440.0 * 2 ** ((m - 69) / 12)

def env(t0, a, d, n=N):  # entrada lineal suave + caída exponencial
    x = (np.arange(n) / SR - t0)
    return np.where(x < 0, 0, np.minimum(1, x / a) * np.exp(-np.maximum(0, x - a) / d))

def pad(notes, t0, t1, gain):
    out = np.zeros(N); a = 2.2; r = 2.4
    seg = np.clip(np.minimum((t - t0) / a, (t1 + r - t) / r), 0, 1) ** 2 * ((t >= t0) & (t <= t1 + r))
    for m in notes:
        for det in (-0.07, 0.0, 0.08):
            fr = f(m) * 2 ** (det / 12)
            ph = 2 * np.pi * fr * t + rng.uniform(0, 6.28)
            out += (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.18 * np.sin(3 * ph)) * (1 + 0.12 * np.sin(2 * np.pi * 0.17 * t + det * 9))
    return out * seg * gain / (3 * len(notes))

def bell(m, t0, g):
    fr = f(m); e = env(t0, 0.004, 1.5)
    return (np.sin(2 * np.pi * fr * t) + 0.45 * np.sin(2 * np.pi * fr * 2.76 * t) * np.exp(-(t - t0) * 3) + 0.25 * np.sin(2 * np.pi * fr * 5.4 * t) * np.exp(-(t - t0) * 7)) * e * g

# Si menor – Sol – Re – La, y resuelve en Re mayor con novena añadida
acordes = [([47, 54, 59, 62, 66], 0.0, 3.7), ([43, 50, 59, 62, 67], 3.6, 7.3), ([38, 50, 57, 62, 66], 7.2, 10.8), ([45, 52, 57, 61, 64], 10.7, 12.8), ([38, 50, 57, 62, 66, 69, 76], 12.6, 15.0)]
m = np.zeros(N)
for notes, a, b in acordes: m += pad(notes, a, b, 1.0)
# subgrave que crece
root = np.sin(2 * np.pi * f(38 - 12) * t) * np.clip((t - 1) / 9, 0, 1) ** 1.5 * np.clip((DUR - 1 - t) / 3, 0, 1) * 0.18
# campanitas: arpegio muy espaciado que entra hacia el 5.º segundo
arp = [(5.0, 78), (6.1, 74), (7.3, 69), (8.3, 74), (9.4, 78), (10.5, 81), (11.7, 86), (12.8, 81), (13.9, 78)]
b = sum(bell(n, s, 0.07 + 0.012 * i) for i, (s, n) in enumerate(arp))
# brisa: ruido filtrado que respira
nz = rng.standard_normal(N)
nz = sosfilt(butter(2, [250, 1700], 'bp', fs=SR, output='sos'), nz)
brisa = nz * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t + 1)) ** 1.5 * np.clip(t / 3, 0, 1) * np.clip((DUR - t) / 2, 0, 1) * 0.09
dry = m * 0.55 + root + b + brisa
# reverb sintética (cola de ruido con caída exponencial), estéreo
L = int(SR * 3.2); tt = np.arange(L) / SR
ir = lambda: rng.standard_normal(L) * np.exp(-tt * 1.7) * (1 - np.exp(-tt * 60))
wetL, wetR = fftconvolve(dry, ir())[:N], fftconvolve(dry, ir())[:N]
wetL /= np.abs(wetL).max() + 1e-9; wetR /= np.abs(wetR).max() + 1e-9
dryn = dry / (np.abs(dry).max() + 1e-9)
# movimiento estéreo lento
pan = 0.5 + 0.18 * np.sin(2 * np.pi * 0.05 * t)
Lc = dryn * (1 - pan) * 1.3 + wetL * 0.55; Rc = dryn * pan * 1.3 + wetR * 0.55
# forma general: sube durante la panorámica, culmina hacia los 12 s y se apaga
forma = np.clip(t / 7.0, 0, 1) ** 1.6 * 0.75 + 0.25 * np.clip((t - 6) / 6, 0, 1)
forma *= np.clip((DUR - t) / 3.2, 0, 1) ** 1.2 * np.clip(t / 0.8, 0, 1)
st = np.stack([Lc * forma, Rc * forma], 1)
st = st / (np.abs(st).max() + 1e-9) * 0.82
raw = (st * 32767).astype('<i2').tobytes()
out = sys.argv[1] if len(sys.argv) > 1 else 'audio/intro.mp3'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '72k', '-ar', '32000', out], input=raw, check=True)
print(out)
