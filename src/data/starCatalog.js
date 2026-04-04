// Bright Star Catalog — ~150 brightest stars (mag < 3.5) from Hipparcos
// ra = right ascension in decimal hours, dec = declination in degrees
// mag = apparent visual magnitude, bv = B-V color index, con = constellation abbreviation
export const STARS = [
  // Mag < 0
  { name: 'Sirius', ra: 6.752, dec: -16.716, mag: -1.46, bv: 0.00, con: 'CMa' },
  { name: 'Canopus', ra: 6.399, dec: -52.696, mag: -0.74, bv: 0.15, con: 'Car' },
  { name: 'Arcturus', ra: 14.261, dec: 19.182, mag: -0.05, bv: 1.23, con: 'Boo' },
  { name: 'Vega', ra: 18.616, dec: 38.784, mag: 0.03, bv: 0.00, con: 'Lyr' },
  { name: 'Capella', ra: 5.278, dec: 45.998, mag: 0.08, bv: 0.80, con: 'Aur' },
  { name: 'Rigel', ra: 5.242, dec: -8.202, mag: 0.13, bv: -0.03, con: 'Ori' },
  // Mag 0-1
  { name: 'Procyon', ra: 7.655, dec: 5.225, mag: 0.34, bv: 0.42, con: 'CMi' },
  { name: 'Betelgeuse', ra: 5.920, dec: 7.407, mag: 0.42, bv: 1.85, con: 'Ori' },
  { name: 'Achernar', ra: 1.629, dec: -57.237, mag: 0.46, bv: -0.16, con: 'Eri' },
  { name: 'Hadar', ra: 14.064, dec: -60.373, mag: 0.61, bv: -0.23, con: 'Cen' },
  { name: 'Altair', ra: 19.846, dec: 8.868, mag: 0.76, bv: 0.22, con: 'Aql' },
  { name: 'Acrux', ra: 12.443, dec: -63.099, mag: 0.76, bv: -0.24, con: 'Cru' },
  { name: 'Aldebaran', ra: 4.599, dec: 16.509, mag: 0.85, bv: 1.54, con: 'Tau' },
  { name: 'Antares', ra: 16.490, dec: -26.432, mag: 0.96, bv: 1.83, con: 'Sco' },
  { name: 'Spica', ra: 13.420, dec: -11.161, mag: 0.97, bv: -0.23, con: 'Vir' },
  { name: 'Pollux', ra: 7.755, dec: 28.026, mag: 1.14, bv: 1.00, con: 'Gem' },
  { name: 'Fomalhaut', ra: 22.961, dec: -29.622, mag: 1.16, bv: 0.09, con: 'PsA' },
  { name: 'Deneb', ra: 20.690, dec: 45.280, mag: 1.25, bv: 0.09, con: 'Cyg' },
  { name: 'Mimosa', ra: 12.795, dec: -59.689, mag: 1.25, bv: -0.23, con: 'Cru' },
  { name: 'Regulus', ra: 10.140, dec: 11.967, mag: 1.35, bv: -0.11, con: 'Leo' },
  // Mag 1-2
  { name: 'Adhara', ra: 6.977, dec: -28.972, mag: 1.50, bv: -0.21, con: 'CMa' },
  { name: 'Castor', ra: 7.577, dec: 31.888, mag: 1.58, bv: 0.03, con: 'Gem' },
  { name: 'Shaula', ra: 17.560, dec: -37.104, mag: 1.62, bv: -0.22, con: 'Sco' },
  { name: 'Gacrux', ra: 12.519, dec: -57.113, mag: 1.63, bv: 1.60, con: 'Cru' },
  { name: 'Bellatrix', ra: 5.419, dec: 6.350, mag: 1.64, bv: -0.22, con: 'Ori' },
  { name: 'Elnath', ra: 5.438, dec: 28.608, mag: 1.65, bv: -0.13, con: 'Tau' },
  { name: 'Miaplacidus', ra: 9.220, dec: -69.717, mag: 1.68, bv: 0.07, con: 'Car' },
  { name: 'Alnilam', ra: 5.604, dec: -1.202, mag: 1.69, bv: -0.18, con: 'Ori' },
  { name: 'Alnair', ra: 22.137, dec: -46.961, mag: 1.74, bv: -0.07, con: 'Gru' },
  { name: 'Alnitak', ra: 5.679, dec: -1.943, mag: 1.77, bv: -0.21, con: 'Ori' },
  { name: 'Alioth', ra: 12.900, dec: 55.960, mag: 1.77, bv: -0.02, con: 'UMa' },
  { name: 'Dubhe', ra: 11.062, dec: 61.751, mag: 1.79, bv: 1.07, con: 'UMa' },
  { name: 'Mirfak', ra: 3.405, dec: 49.861, mag: 1.80, bv: 0.48, con: 'Per' },
  { name: 'Kaus Australis', ra: 18.403, dec: -34.384, mag: 1.85, bv: -0.03, con: 'Sgr' },
  { name: 'Wezen', ra: 7.140, dec: -26.393, mag: 1.84, bv: 0.67, con: 'CMa' },
  { name: 'Alkaid', ra: 13.792, dec: 49.313, mag: 1.86, bv: -0.19, con: 'UMa' },
  { name: 'Sargas', ra: 17.622, dec: -42.998, mag: 1.87, bv: 0.40, con: 'Sco' },
  { name: 'Avior', ra: 8.375, dec: -59.509, mag: 1.86, bv: 1.28, con: 'Car' },
  { name: 'Menkalinan', ra: 5.992, dec: 44.948, mag: 1.90, bv: 0.08, con: 'Aur' },
  { name: 'Atria', ra: 16.811, dec: -69.028, mag: 1.92, bv: 1.44, con: 'TrA' },
  { name: 'Alhena', ra: 6.629, dec: 16.399, mag: 1.93, bv: 0.00, con: 'Gem' },
  { name: 'Peacock', ra: 20.428, dec: -56.735, mag: 1.94, bv: -0.20, con: 'Pav' },
  { name: 'Alsephina', ra: 8.158, dec: -47.337, mag: 1.96, bv: -0.11, con: 'Vel' },
  { name: 'Mirzam', ra: 6.378, dec: -17.956, mag: 1.98, bv: -0.24, con: 'CMa' },
  { name: 'Alphard', ra: 9.460, dec: -8.659, mag: 1.98, bv: 1.44, con: 'Hya' },
  { name: 'Polaris', ra: 2.530, dec: 89.264, mag: 1.98, bv: 0.60, con: 'UMi' },
  { name: 'Hamal', ra: 2.120, dec: 23.462, mag: 2.00, bv: 1.15, con: 'Ari' },
  { name: 'Diphda', ra: 0.727, dec: -17.987, mag: 2.02, bv: 1.02, con: 'Cet' },
  // Mag 2-2.5
  { name: 'Nunki', ra: 18.921, dec: -26.297, mag: 2.05, bv: -0.13, con: 'Sgr' },
  { name: 'Menkent', ra: 14.111, dec: -36.370, mag: 2.06, bv: 1.01, con: 'Cen' },
  { name: 'Saiph', ra: 5.796, dec: -9.670, mag: 2.09, bv: -0.18, con: 'Ori' },
  { name: 'Alpheratz', ra: 0.140, dec: 29.091, mag: 2.06, bv: -0.11, con: 'And' },
  { name: 'Tiaki', ra: 22.712, dec: -46.885, mag: 2.07, bv: 1.60, con: 'Gru' },
  { name: 'Mirach', ra: 1.163, dec: 35.621, mag: 2.06, bv: 1.58, con: 'And' },
  { name: 'Kochab', ra: 14.845, dec: 74.156, mag: 2.08, bv: 1.47, con: 'UMi' },
  { name: 'Rasalhague', ra: 17.582, dec: 12.560, mag: 2.08, bv: 0.15, con: 'Oph' },
  { name: 'Algol', ra: 3.136, dec: 40.957, mag: 2.12, bv: -0.05, con: 'Per' },
  { name: 'Almach', ra: 2.065, dec: 42.330, mag: 2.14, bv: 1.37, con: 'And' },
  { name: 'Denebola', ra: 11.818, dec: 14.572, mag: 2.14, bv: 0.09, con: 'Leo' },
  { name: 'Naos', ra: 8.060, dec: -40.003, mag: 2.25, bv: -0.27, con: 'Pup' },
  { name: 'Sadr', ra: 20.370, dec: 40.257, mag: 2.23, bv: 0.68, con: 'Cyg' },
  { name: 'Schedar', ra: 0.675, dec: 56.537, mag: 2.23, bv: 1.17, con: 'Cas' },
  { name: 'Eltanin', ra: 17.944, dec: 51.489, mag: 2.23, bv: 1.52, con: 'Dra' },
  { name: 'Mintaka', ra: 5.533, dec: -0.299, mag: 2.23, bv: -0.21, con: 'Ori' },
  { name: 'Caph', ra: 0.153, dec: 59.150, mag: 2.27, bv: 0.34, con: 'Cas' },
  { name: 'Dschubba', ra: 16.005, dec: -22.622, mag: 2.32, bv: -0.12, con: 'Sco' },
  { name: 'Larawag', ra: 16.836, dec: -34.293, mag: 2.29, bv: 1.15, con: 'Sco' },
  { name: 'Merak', ra: 11.031, dec: 56.382, mag: 2.37, bv: 0.03, con: 'UMa' },
  { name: 'Izar', ra: 14.750, dec: 27.074, mag: 2.37, bv: 1.01, con: 'Boo' },
  { name: 'Enif', ra: 21.736, dec: 9.875, mag: 2.39, bv: 1.53, con: 'Peg' },
  { name: 'Ankaa', ra: 0.438, dec: -42.306, mag: 2.38, bv: 1.09, con: 'Phe' },
  { name: 'Phecda', ra: 11.897, dec: 53.695, mag: 2.44, bv: 0.04, con: 'UMa' },
  { name: 'Sabik', ra: 17.173, dec: -15.725, mag: 2.43, bv: 0.06, con: 'Oph' },
  { name: 'Scheat', ra: 23.063, dec: 28.083, mag: 2.42, bv: 1.67, con: 'Peg' },
  { name: 'Aludra', ra: 7.402, dec: -29.303, mag: 2.45, bv: -0.08, con: 'CMa' },
  { name: 'Markab', ra: 23.079, dec: 15.205, mag: 2.49, bv: -0.04, con: 'Peg' },
  { name: 'Alderamin', ra: 21.310, dec: 62.586, mag: 2.51, bv: 0.22, con: 'Cep' },
  // Mag 2.5-3.0
  { name: 'Menkar', ra: 3.038, dec: 4.090, mag: 2.53, bv: 1.63, con: 'Cet' },
  { name: 'Thuban', ra: 14.073, dec: 64.376, mag: 3.67, bv: -0.05, con: 'Dra' },
  { name: 'Nashira', ra: 21.668, dec: -16.662, mag: 3.68, bv: 0.32, con: 'Cap' },
  { name: 'Zubeneschamali', ra: 15.283, dec: -9.383, mag: 2.61, bv: -0.11, con: 'Lib' },
  { name: 'Zubenelgenubi', ra: 14.848, dec: -16.042, mag: 2.75, bv: 0.15, con: 'Lib' },
  { name: 'Phact', ra: 5.661, dec: -34.074, mag: 2.64, bv: -0.12, con: 'Col' },
  { name: 'Ruchbah', ra: 1.907, dec: 60.235, mag: 2.68, bv: 0.13, con: 'Cas' },
  { name: 'Muphrid', ra: 13.912, dec: 18.398, mag: 2.68, bv: 0.58, con: 'Boo' },
  { name: 'Hassaleh', ra: 4.950, dec: 33.166, mag: 2.69, bv: 1.53, con: 'Aur' },
  { name: 'Mizar', ra: 13.399, dec: 54.926, mag: 2.27, bv: 0.02, con: 'UMa' },
  { name: 'Alcor', ra: 13.420, dec: 54.988, mag: 3.99, bv: 0.16, con: 'UMa' },
  { name: 'Megrez', ra: 12.257, dec: 57.033, mag: 3.31, bv: 0.07, con: 'UMa' },
  { name: 'Algenib', ra: 0.220, dec: 15.184, mag: 2.83, bv: -0.11, con: 'Peg' },
  { name: 'Gienah', ra: 12.263, dec: -17.542, mag: 2.59, bv: -0.11, con: 'Crv' },
  { name: 'Algorab', ra: 12.497, dec: -16.515, mag: 2.95, bv: 0.01, con: 'Crv' },
  { name: 'Deneb Algedi', ra: 21.784, dec: -16.127, mag: 2.87, bv: 0.31, con: 'Cap' },
  { name: 'Rasalgethi', ra: 17.244, dec: 14.390, mag: 2.81, bv: 1.44, con: 'Her' },
  { name: 'Kornephoros', ra: 16.504, dec: 21.490, mag: 2.77, bv: 0.94, con: 'Her' },
  { name: 'Unukalhai', ra: 15.738, dec: 6.426, mag: 2.65, bv: 1.17, con: 'Ser' },
  { name: 'Albireo', ra: 19.512, dec: 27.960, mag: 3.08, bv: 1.09, con: 'Cyg' },
  { name: 'Gienah Cygni', ra: 20.770, dec: 33.970, mag: 2.46, bv: 1.02, con: 'Cyg' },
  { name: 'Cor Caroli', ra: 12.934, dec: 38.318, mag: 2.81, bv: -0.12, con: 'CVn' },
  { name: 'Vindemiatrix', ra: 13.036, dec: 10.959, mag: 2.83, bv: 0.94, con: 'Vir' },
  { name: 'Alrescha', ra: 2.034, dec: 2.764, mag: 3.82, bv: 0.19, con: 'Psc' },
  // Key navigational + constellation stars (mag 3.0-3.5)
  { name: 'Tarazed', ra: 19.771, dec: 10.613, mag: 2.72, bv: 1.52, con: 'Aql' },
  { name: 'Muscida', ra: 8.505, dec: 60.718, mag: 3.35, bv: 0.92, con: 'UMa' },
  { name: 'Navi', ra: 0.945, dec: 60.717, mag: 2.47, bv: -0.15, con: 'Cas' },
  { name: 'Sadalmelik', ra: 22.096, dec: -0.320, mag: 2.96, bv: 0.97, con: 'Aqr' },
  { name: 'Sadalsuud', ra: 21.526, dec: -5.571, mag: 2.91, bv: 0.83, con: 'Aqr' },
  { name: 'Acrab', ra: 16.091, dec: -19.806, mag: 2.62, bv: -0.07, con: 'Sco' },
  { name: 'Lesath', ra: 17.531, dec: -37.296, mag: 2.69, bv: -0.22, con: 'Sco' },
  { name: 'Kaus Media', ra: 18.350, dec: -29.828, mag: 2.70, bv: 1.38, con: 'Sgr' },
  { name: 'Kaus Borealis', ra: 18.229, dec: -25.422, mag: 2.81, bv: 1.05, con: 'Sgr' },
  { name: 'Ascella', ra: 19.043, dec: -29.880, mag: 2.59, bv: 0.08, con: 'Sgr' },
  { name: 'Yed Prior', ra: 16.239, dec: -3.694, mag: 2.74, bv: 1.16, con: 'Oph' },
  { name: 'Cebalrai', ra: 17.724, dec: 4.567, mag: 2.77, bv: 1.17, con: 'Oph' },
  { name: 'Algieba', ra: 10.333, dec: 19.842, mag: 2.28, bv: 1.14, con: 'Leo' },
  { name: 'Zosma', ra: 11.235, dec: 20.524, mag: 2.56, bv: 0.13, con: 'Leo' },
  { name: 'Chertan', ra: 11.394, dec: 15.430, mag: 3.34, bv: 0.07, con: 'Leo' },
  { name: 'Nekkar', ra: 15.032, dec: 40.391, mag: 3.58, bv: 0.95, con: 'Boo' },
]

// Constellation stick figure lines — indices into STARS array
// Each constellation has an array of line pairs [fromStarIdx, toStarIdx]
function idx(name) {
  const i = STARS.findIndex(s => s.name === name)
  if (i < 0) console.warn('Star not found:', name)
  return i
}

export const CONSTELLATIONS = [
  {
    name: 'Orion', abbr: 'Ori',
    lines: [
      [idx('Betelgeuse'), idx('Bellatrix')],
      [idx('Betelgeuse'), idx('Alnilam')],
      [idx('Bellatrix'), idx('Mintaka')],
      [idx('Mintaka'), idx('Alnilam')],
      [idx('Alnilam'), idx('Alnitak')],
      [idx('Alnitak'), idx('Saiph')],
      [idx('Mintaka'), idx('Rigel')],
      [idx('Rigel'), idx('Saiph')],
    ]
  },
  {
    name: 'Ursa Major', abbr: 'UMa',
    lines: [
      [idx('Dubhe'), idx('Merak')],
      [idx('Merak'), idx('Phecda')],
      [idx('Phecda'), idx('Megrez')],
      [idx('Megrez'), idx('Alioth')],
      [idx('Alioth'), idx('Mizar')],
      [idx('Mizar'), idx('Alkaid')],
      [idx('Megrez'), idx('Dubhe')],
    ]
  },
  {
    name: 'Cassiopeia', abbr: 'Cas',
    lines: [
      [idx('Caph'), idx('Schedar')],
      [idx('Schedar'), idx('Navi')],
      [idx('Navi'), idx('Ruchbah')],
    ]
  },
  {
    name: 'Cygnus', abbr: 'Cyg',
    lines: [
      [idx('Deneb'), idx('Sadr')],
      [idx('Sadr'), idx('Gienah Cygni')],
      [idx('Sadr'), idx('Albireo')],
    ]
  },
  {
    name: 'Leo', abbr: 'Leo',
    lines: [
      [idx('Regulus'), idx('Algieba')],
      [idx('Algieba'), idx('Zosma')],
      [idx('Zosma'), idx('Denebola')],
      [idx('Zosma'), idx('Chertan')],
      [idx('Regulus'), idx('Chertan')],
    ]
  },
  {
    name: 'Scorpius', abbr: 'Sco',
    lines: [
      [idx('Antares'), idx('Dschubba')],
      [idx('Dschubba'), idx('Acrab')],
      [idx('Antares'), idx('Larawag')],
      [idx('Larawag'), idx('Shaula')],
      [idx('Shaula'), idx('Lesath')],
    ]
  },
  {
    name: 'Gemini', abbr: 'Gem',
    lines: [
      [idx('Castor'), idx('Pollux')],
      [idx('Castor'), idx('Alhena')],
      [idx('Pollux'), idx('Alhena')],
    ]
  },
  {
    name: 'Lyra', abbr: 'Lyr',
    lines: [] // Vega is the anchor; small constellation
  },
  {
    name: 'Aquila', abbr: 'Aql',
    lines: [
      [idx('Altair'), idx('Tarazed')],
    ]
  },
  {
    name: 'Canis Major', abbr: 'CMa',
    lines: [
      [idx('Sirius'), idx('Mirzam')],
      [idx('Sirius'), idx('Adhara')],
      [idx('Adhara'), idx('Wezen')],
      [idx('Wezen'), idx('Aludra')],
    ]
  },
  {
    name: 'Taurus', abbr: 'Tau',
    lines: [
      [idx('Aldebaran'), idx('Elnath')],
    ]
  },
  {
    name: 'Virgo', abbr: 'Vir',
    lines: [
      [idx('Spica'), idx('Vindemiatrix')],
    ]
  },
  {
    name: 'Bootes', abbr: 'Boo',
    lines: [
      [idx('Arcturus'), idx('Izar')],
      [idx('Arcturus'), idx('Muphrid')],
    ]
  },
  {
    name: 'Perseus', abbr: 'Per',
    lines: [
      [idx('Mirfak'), idx('Algol')],
    ]
  },
  {
    name: 'Andromeda', abbr: 'And',
    lines: [
      [idx('Alpheratz'), idx('Mirach')],
      [idx('Mirach'), idx('Almach')],
    ]
  },
  {
    name: 'Pegasus', abbr: 'Peg',
    lines: [
      [idx('Markab'), idx('Scheat')],
      [idx('Scheat'), idx('Alpheratz')],
      [idx('Alpheratz'), idx('Algenib')],
      [idx('Algenib'), idx('Markab')],
      [idx('Markab'), idx('Enif')],
    ]
  },
  {
    name: 'Sagittarius', abbr: 'Sgr',
    lines: [
      [idx('Kaus Australis'), idx('Kaus Media')],
      [idx('Kaus Media'), idx('Kaus Borealis')],
      [idx('Kaus Australis'), idx('Ascella')],
      [idx('Ascella'), idx('Nunki')],
    ]
  },
  {
    name: 'Auriga', abbr: 'Aur',
    lines: [
      [idx('Capella'), idx('Menkalinan')],
      [idx('Capella'), idx('Hassaleh')],
      [idx('Menkalinan'), idx('Elnath')],
    ]
  },
  {
    name: 'Ophiuchus', abbr: 'Oph',
    lines: [
      [idx('Rasalhague'), idx('Sabik')],
      [idx('Rasalhague'), idx('Cebalrai')],
      [idx('Sabik'), idx('Yed Prior')],
    ]
  },
  {
    name: 'Hercules', abbr: 'Her',
    lines: [
      [idx('Kornephoros'), idx('Rasalgethi')],
    ]
  },
  {
    name: 'Ursa Minor', abbr: 'UMi',
    lines: [
      [idx('Polaris'), idx('Kochab')],
    ]
  },
  {
    name: 'Libra', abbr: 'Lib',
    lines: [
      [idx('Zubeneschamali'), idx('Zubenelgenubi')],
    ]
  },
  {
    name: 'Aries', abbr: 'Ari',
    lines: [] // Hamal is the anchor
  },
  {
    name: 'Capricornus', abbr: 'Cap',
    lines: [
      [idx('Deneb Algedi'), idx('Nashira')],
    ]
  },
  {
    name: 'Aquarius', abbr: 'Aqr',
    lines: [
      [idx('Sadalmelik'), idx('Sadalsuud')],
    ]
  },
  {
    name: 'Corvus', abbr: 'Crv',
    lines: [
      [idx('Gienah'), idx('Algorab')],
    ]
  },
  {
    name: 'Serpens', abbr: 'Ser',
    lines: [] // Unukalhai is the anchor
  },
  {
    name: 'Draco', abbr: 'Dra',
    lines: [
      [idx('Eltanin'), idx('Thuban')],
    ]
  },
  {
    name: 'Cepheus', abbr: 'Cep',
    lines: [] // Alderamin is the anchor
  },
]

// B-V color index → RGB color for star rendering
export function bvToColor(bv) {
  // Attempt an approximation of blackbody radiation color
  let r, g, b
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
  // Temperature to RGB (simplified Planck)
  if (t >= 6600) {
    r = 255
    g = Math.min(255, Math.max(0, 329.7 * Math.pow((t / 100 - 60) / 10, -0.133)))
    b = Math.min(255, Math.max(0, t >= 6600 ? 255 : 138.5 * Math.log(t / 100 - 10) - 305.04))
  } else {
    r = Math.min(255, Math.max(0, t <= 6600 ? 255 : 329.7 * Math.pow(t / 100 - 60, -0.133)))
    g = Math.min(255, Math.max(0, 99.47 * Math.log(t / 100) - 161.1))
    b = t >= 6600 ? 255 : Math.min(255, Math.max(0, t <= 1900 ? 0 : 138.5 * Math.log(t / 100 - 10) - 305.04))
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

// Milky Way center line — simplified galactic plane in RA/Dec
export const MILKY_WAY_POINTS = [
  { ra: 18.5, dec: -30 }, { ra: 19.0, dec: -20 }, { ra: 19.5, dec: -10 },
  { ra: 20.0, dec: 0 }, { ra: 20.5, dec: 15 }, { ra: 21.0, dec: 30 },
  { ra: 21.5, dec: 45 }, { ra: 22.0, dec: 55 }, { ra: 23.0, dec: 60 },
  { ra: 0.0, dec: 58 }, { ra: 1.0, dec: 55 }, { ra: 2.0, dec: 50 },
  { ra: 3.0, dec: 40 }, { ra: 4.0, dec: 30 }, { ra: 5.0, dec: 20 },
  { ra: 6.0, dec: 10 }, { ra: 6.5, dec: 0 }, { ra: 7.0, dec: -15 },
  { ra: 7.5, dec: -25 }, { ra: 8.0, dec: -35 },
]

// ── Enhanced Milky Way Band (with width and brightness) ──
export const MILKY_WAY_BAND = [
  { ra: 18.0, dec: -33, width: 30, brightness: 1.0 },
  { ra: 18.5, dec: -28, width: 28, brightness: 0.9 },
  { ra: 19.0, dec: -20, width: 22, brightness: 0.7 },
  { ra: 19.5, dec: -10, width: 18, brightness: 0.5 },
  { ra: 20.0, dec: 0, width: 15, brightness: 0.45 },
  { ra: 20.5, dec: 15, width: 18, brightness: 0.5 },
  { ra: 21.0, dec: 30, width: 15, brightness: 0.4 },
  { ra: 21.5, dec: 45, width: 12, brightness: 0.35 },
  { ra: 22.0, dec: 55, width: 10, brightness: 0.3 },
  { ra: 23.0, dec: 60, width: 10, brightness: 0.3 },
  { ra: 0.0, dec: 58, width: 10, brightness: 0.25 },
  { ra: 1.0, dec: 55, width: 8, brightness: 0.2 },
  { ra: 2.0, dec: 50, width: 8, brightness: 0.2 },
  { ra: 3.0, dec: 40, width: 10, brightness: 0.25 },
  { ra: 4.0, dec: 30, width: 10, brightness: 0.3 },
  { ra: 5.0, dec: 20, width: 12, brightness: 0.35 },
  { ra: 5.5, dec: 10, width: 15, brightness: 0.4 },
  { ra: 6.0, dec: 5, width: 15, brightness: 0.4 },
  { ra: 6.5, dec: 0, width: 15, brightness: 0.45 },
  { ra: 7.0, dec: -15, width: 18, brightness: 0.5 },
  { ra: 7.5, dec: -25, width: 20, brightness: 0.55 },
  { ra: 8.0, dec: -35, width: 22, brightness: 0.6 },
  { ra: 10.0, dec: -50, width: 18, brightness: 0.45 },
  { ra: 12.0, dec: -60, width: 15, brightness: 0.4 },
  { ra: 14.0, dec: -55, width: 18, brightness: 0.5 },
  { ra: 16.0, dec: -40, width: 25, brightness: 0.7 },
  { ra: 17.0, dec: -35, width: 28, brightness: 0.85 },
]

// ── Deep Sky Objects (Messier + notable NGC) ──
export const DEEP_SKY_OBJECTS = [
  { id: 'M31', name: 'Andromeda Galaxy', ra: 0.712, dec: 41.27, mag: 3.4, type: 'Galaxy', size: 3.0, con: 'And' },
  { id: 'M42', name: 'Orion Nebula', ra: 5.588, dec: -5.39, mag: 4.0, type: 'Nebula', size: 1.5, con: 'Ori' },
  { id: 'M45', name: 'Pleiades', ra: 3.787, dec: 24.12, mag: 1.6, type: 'Cluster', size: 2.0, con: 'Tau' },
  { id: 'M13', name: 'Hercules Cluster', ra: 16.695, dec: 36.46, mag: 5.8, type: 'Cluster', size: 0.5, con: 'Her' },
  { id: 'M1', name: 'Crab Nebula', ra: 5.576, dec: 22.01, mag: 8.4, type: 'Remnant', size: 0.3, con: 'Tau' },
  { id: 'M51', name: 'Whirlpool Galaxy', ra: 13.500, dec: 47.20, mag: 8.4, type: 'Galaxy', size: 0.4, con: 'CVn' },
  { id: 'M81', name: "Bode's Galaxy", ra: 9.926, dec: 69.07, mag: 6.9, type: 'Galaxy', size: 0.5, con: 'UMa' },
  { id: 'M44', name: 'Beehive Cluster', ra: 8.667, dec: 19.67, mag: 3.7, type: 'Cluster', size: 1.5, con: 'Cnc' },
  { id: 'M8', name: 'Lagoon Nebula', ra: 18.063, dec: -24.38, mag: 6.0, type: 'Nebula', size: 0.8, con: 'Sgr' },
  { id: 'M20', name: 'Trifid Nebula', ra: 18.044, dec: -23.03, mag: 6.3, type: 'Nebula', size: 0.5, con: 'Sgr' },
  { id: 'M17', name: 'Omega Nebula', ra: 18.346, dec: -16.18, mag: 6.0, type: 'Nebula', size: 0.6, con: 'Sgr' },
  { id: 'M57', name: 'Ring Nebula', ra: 18.893, dec: 33.03, mag: 8.8, type: 'Nebula', size: 0.2, con: 'Lyr' },
  { id: 'M27', name: 'Dumbbell Nebula', ra: 19.994, dec: 22.72, mag: 7.5, type: 'Nebula', size: 0.4, con: 'Vul' },
  { id: 'M33', name: 'Triangulum Galaxy', ra: 1.564, dec: 30.66, mag: 5.7, type: 'Galaxy', size: 1.0, con: 'Tri' },
  { id: 'M22', name: 'Sagittarius Cluster', ra: 18.607, dec: -23.90, mag: 5.1, type: 'Cluster', size: 0.5, con: 'Sgr' },
  { id: 'M7', name: "Ptolemy's Cluster", ra: 17.898, dec: -34.79, mag: 3.3, type: 'Cluster', size: 1.3, con: 'Sco' },
  { id: 'M6', name: 'Butterfly Cluster', ra: 17.668, dec: -32.25, mag: 4.2, type: 'Cluster', size: 0.8, con: 'Sco' },
  { id: 'M35', name: 'Shoe-Buckle Cluster', ra: 6.149, dec: 24.33, mag: 5.3, type: 'Cluster', size: 0.5, con: 'Gem' },
  { id: 'M41', name: 'Little Beehive', ra: 6.783, dec: -20.72, mag: 4.5, type: 'Cluster', size: 0.6, con: 'CMa' },
  { id: 'NGC869', name: 'Double Cluster', ra: 2.327, dec: 57.13, mag: 3.7, type: 'Cluster', size: 1.0, con: 'Per' },
]

// ── Meteor Shower Radiants (RA in hours, Dec in degrees) ──
export const METEOR_RADIANTS = [
  { name: 'Quadrantids', peak: '01-03', rate: 120, ra: 15.33, dec: 49.7 },
  { name: 'Lyrids', peak: '04-22', rate: 18, ra: 18.07, dec: 33.3 },
  { name: 'Eta Aquariids', peak: '05-06', rate: 50, ra: 22.33, dec: -1.0 },
  { name: 'Delta Aquariids', peak: '07-29', rate: 20, ra: 22.67, dec: -16.3 },
  { name: 'Perseids', peak: '08-12', rate: 100, ra: 3.07, dec: 58.0 },
  { name: 'Orionids', peak: '10-21', rate: 20, ra: 6.33, dec: 15.5 },
  { name: 'Leonids', peak: '11-17', rate: 15, ra: 10.15, dec: 22.2 },
  { name: 'Geminids', peak: '12-14', rate: 150, ra: 7.47, dec: 32.5 },
  { name: 'Ursids', peak: '12-22', rate: 10, ra: 14.47, dec: 75.8 },
]
