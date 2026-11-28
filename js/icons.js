// ============================================================
// SHARDFALL - icons: stained-glass style SVG icon set (32x32 grid)
// part roles: a = main glass, b = pale glass, k = lead fill, w = light glint,
//             l = lead line, G = leaded line in main glass, g = leaded line in pale glass
// colours come from CSS variables --ia / --ib / --ik so one icon works on every rarity
// ============================================================
(() => {
  const G = window.G;
  const C = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const crescent = 'M16 2.5c6 0 10.5 3.4 12 9-3.7-3-7.6-4.2-12-3.6z';

  const D = {
    blade: [['b', 'M20 3h9v9L15 26l-9-9z'], ['l', 'M25 7 11 21'], ['a', 'M3.5 18.5 13.5 28.5 12.2 29.8 2.2 19.8z'], ['l', 'M8 24 5 27'], ['a', C(4.2, 27.8, 2.2)]],
    bolt: [['a', 'M19 2 6 18h8.5L11 30l15-17h-8.5L22 2z'], ['w', 'M18.2 5.2 10.5 15h2.6z']],
    target: [['b', C(16, 16, 12)], ['a', C(16, 16, 7)], ['k', C(16, 16, 2.5)], ['l', 'M16 1v5M16 26v5M1 16h5M26 16h5']],
    boot: [['l', 'M1.5 12h4M2.5 17h3'], ['a', 'M8 4h9v11l9 5v6H7z'], ['l', 'M7 22.5h19M11.5 8.5h5M11.5 12.5h5'], ['b', 'M21 6l8-3-2 6 3 1-7 4z']],
    heart: [['a', 'M16 28C6.5 21.5 3 16 3 10.5A6.5 6.5 0 0 1 16 8.2 6.5 6.5 0 0 1 29 10.5C29 16 25.5 21.5 16 28z'], ['w', 'M7 11.5c0-2.4 1.6-4 3.6-4.2-1.2 1.3-1.8 2.8-1.9 4.5z']],
    magnet: [['a', 'M5 4h7v12a4 4 0 0 0 8 0V4h7v12a11 11 0 0 1-22 0z'], ['b', 'M5 4h7v5H5zM20 4h7v5h-7z']],
    book: [['b', 'M2.5 7.5C7 5.5 11.5 6 16 9v17c-4.5-3-9-3.5-13.5-1.5z'], ['b', 'M29.5 7.5C25 5.5 20.5 6 16 9v17c4.5-3 9-3.5 13.5-1.5z'], ['l', 'M6 12.5c2.5-.8 5-.5 7 .7M6 16.5c2.5-.8 5-.5 7 .7M19 13.2c2-1.2 4.5-1.5 7-.7M19 17.2c2-1.2 4.5-1.5 7-.7'], ['a', 'M21 2.5h5v9l-2.5-2-2.5 2z']],
    arrow: [['l', 'M3 16h16M4 10.5h7M4 21.5h7'], ['a', 'M17 8.5 30 16l-13 7.5z']],
    crystal: [['a', 'M16 2l9.5 9-3.5 18h-12L6.5 11z'], ['b', 'M16 2 6.5 11 10 29h6z'], ['l', 'M6.5 11h19M16 2v27']],
    shield: [['a', 'M16 2.5 27 6.5V14c0 7.5-4.5 12.5-11 15.5C9.5 26.5 5 21.5 5 14V6.5z'], ['b', 'M16 6.5 23 9v5c0 5-2.6 8.5-7 11z'], ['l', 'M16 6.5v18.5']],
    trident: [['l', 'M16 30V10M16 30 7.5 11.5M16 30l8.5-18.5'], ['a', 'M16 2.5l3.2 5.5-3.2 3-3.2-3z'], ['a', 'M5.5 5.5l4.5 2.4-.6 4.5-4.2-1.8z'], ['a', 'M26.5 5.5l.3 5.1-4.2 1.8-.6-4.5z']],
    pierce: [['b', 'M16 6.1 25.9 16 16 25.9 6.1 16z'], ['l', 'M3 29 24.5 7.5'], ['a', 'M29.5 2.5l-2.2 9.2-7-7z']],
    skull: [['b', 'M16 3C9 3 5 7.8 5 13.5c0 4 1.8 6.6 4 7.8V26h14v-4.7c2.2-1.2 4-3.8 4-7.8C27 7.8 23 3 16 3z'], ['k', C(12.5, 13.5, 3) + C(19.5, 13.5, 3) + 'M16 17.5l-2 3.5h4z'], ['l', 'M12.5 26v-3.5M16 26v-3.5M19.5 26v-3.5']],
    leaf: [['a', 'M27.5 3.5C15 3.5 5.5 10 5.5 20c0 3 .8 5.2 2 7 9.5 1 17.8-6.5 20-23.5z'], ['l', 'M7.5 27C10 19.5 15 13 22 9M12.2 19.4l-.6-5M15.6 15.4l4.6-.4']],
    wind: [['G', 'M3 11h15a4 4 0 1 0-4-4M3 17h21a4 4 0 1 1-4 4M3 23h9']],
    rune: [['b', C(16, 16, 12.5)], ['a', 'M16 6.5l8.5 15h-17z'], ['l', 'M16 6.5v15M7.5 21.5 16 13l8.5 8.5'], ['k', C(16, 16.5, 2)]],
    flame: [['a', 'M16 2c1.5 6 9 9 9 17.5a9 9 0 0 1-18 0c0-5.5 3-8.5 5.2-10.5-.2 4 1.6 6.5 3.3 6.8C15 11 14.6 6.5 16 2z'], ['b', 'M16 15.5c2 3 4.2 4.4 4.2 7.6a4.2 4.2 0 0 1-8.4 0c0-3 2.2-4.6 4.2-7.6z']],
    snow: [['g', 'M16 2.5v27M4.3 9.25 27.7 22.75M4.3 22.75 27.7 9.25M12.5 3.5 16 7l3.5-3.5M12.5 28.5 16 25l3.5 3.5M25.1 6.7 23.8 11.5l4.8 1.3M3.4 19.2 8.2 20.5l-1.3 4.8M6.9 6.7 8.2 11.5l-4.8 1.3M28.6 19.2 23.8 20.5l1.3 4.8'], ['a', 'M16 12.5 19 14.25v3.5L16 19.5 13 17.75v-3.5z']],
    eye: [['b', 'M2 16C6 9 10.5 6 16 6s10 3 14 10c-4 7-8.5 10-14 10S6 23 2 16z'], ['a', C(16, 16, 6)], ['k', C(16, 16, 2.5)], ['w', C(18.8, 13, 1.3)]],
    thorns: [['a', 'M16 2 18.7 9.5 25.9 6.1 22.5 13.3 30 16 22.5 18.7 25.9 25.9 18.7 22.5 16 30 13.3 22.5 6.1 25.9 9.5 18.7 2 16 9.5 13.3 6.1 6.1 13.3 9.5z'], ['b', C(16, 16, 5)]],
    crown: [['a', 'M3.5 25 5.5 9l6.5 6.5L16 5l4 10.5L26.5 9l2 16z'], ['b', 'M3.5 24h25v4.5h-25z'], ['k', C(16, 19, 1.6)]],
    meteor: [['G', 'M14 18 3.5 28.5M10.5 13.5 3 21M18.5 21.5 11 29'], ['a', C(20.5, 12, 8.5)], ['b', C(19, 9.5, 3)], ['k', C(24.3, 15.5, 1.8)]],
    ice: [['b', 'M16 2.5 27.5 9v14L16 29.5 4.5 23V9z'], ['a', 'M16 16 27.5 9v14L16 29.5z'], ['l', 'M4.5 9 16 16l11.5-7M16 16v13.5']],
    spear: [['G', 'M3.5 28.5 21 11'], ['a', 'M30 2l-2.6 11.2-8.6-8.6z'], ['b', 'M17.2 12.6l2.2 2.2-3.4 3.4-2.2-2.2z']],
    battery: [['b', 'M4 9h19v14H4z'], ['k', 'M23 13h3.5v6H23z'], ['a', 'M15 10.5 9.5 17h4l-2 5 6.5-7h-4z']],
    chain: [['G', 'M4 7l8 6.5-3.5 4.5 9.5 1.5-2.5 5L28 26'], ['a', C(4, 7, 2.5) + C(28, 26, 2.5)]],
    burst: [['a', 'M16 1.5 18.2 9.3 24.5 4.3 21.7 11.9 29.8 11.5 23 16 29.8 20.5 21.7 20.1 24.5 27.7 18.2 22.7 16 30.5 13.8 22.7 7.5 27.7 10.3 20.1 2.2 20.5 9 16 2.2 11.5 10.3 11.9 7.5 4.3 13.8 9.3z'], ['b', C(16, 16, 4.5)]],
    ricochet: [['G', 'M3 27 12 11l6 12 8-15'], ['a', 'M30 2.5l-.6 8.4-6.6-3.6z'], ['l', 'M2 29.5h9']],
    blades: [['a', crescent], ['a', crescent, 'rotate(120 16 16)'], ['a', crescent, 'rotate(240 16 16)'], ['b', C(16, 16, 5)]],
    drone: [['l', 'M2.5 17a13.5 5 0 1 0 27 0a13.5 5 0 1 0-27 0'], ['a', C(16, 15, 6.5)], ['k', C(16, 14, 2)]],
    drop: [['a', 'M16 2.5c5 7.5 9.5 12 9.5 17.5a9.5 9.5 0 0 1-19 0C6.5 14.5 11 10 16 2.5z'], ['w', 'M11 19.5c0-2.5 1-4.5 2.5-6.5-.4 2.6-.2 4.6.6 6.5z']],
    axe: [['G', 'M7.5 29.5 21 6'], ['a', 'M17.5 3.5c6.5-.5 11.5 3.5 12 10-3.6-2-7.4-2.4-10.6-.6l-5.8-5.8c1.6-1.6 2.6-2.8 4.4-3.6z']],
    blink: [['G', 'M3 9.5l6.5 6.5L3 22.5M11 9.5l6.5 6.5L11 22.5'], ['a', 'M24.5 9.5l1.6 4.9 4.9 1.6-4.9 1.6-1.6 4.9-1.6-4.9-4.9-1.6 4.9-1.6z']],
    star: [['a', 'M16 2.8 19.6 11.8 29.3 12.5 21.9 18.7 24.2 28.1 16 23 7.8 28.1 10.1 18.7 2.7 12.5 12.4 11.8z'], ['b', 'M16 21.2c-3-2-4.2-3.6-4.2-5.2a2.1 2.1 0 0 1 4.2-.6 2.1 2.1 0 0 1 4.2.6c0 1.6-1.2 3.2-4.2 5.2z']],
    echo: [['b', 'M10.5 3l6 13-6 13-6-13z'], ['a', 'M21 3l6.5 13L21 29l-6.5-13z'], ['l', 'M21 3v26']],
    feather: [['a', 'M27.5 3C16 4 7.5 11.5 6.5 23.5l-1 4 1.6.4 1.6-3.6C20 23 27 15 27.5 3z'], ['l', 'M5.8 28.5 21.5 9.5M11.5 21.3l7.4.4M14.6 17.5l7.6-.6M17.6 13.8l6.2-1.6']],
    hourglass: [['b', 'M7 3h18v3.2H7zM7 25.8h18V29H7z'], ['a', 'M9 6.2h14c0 6-5.2 8-5.2 9.8s5.2 3.8 5.2 9.8H9c0-6 5.2-8 5.2-9.8S9 12.2 9 6.2z'], ['k', 'M12.2 25.8c.9-2.6 2.6-3.8 3.8-3.8s2.9 1.2 3.8 3.8zM13.5 10h5c-.8 1.6-1.8 2.4-2.5 3-.7-.6-1.7-1.4-2.5-3z']],
    storm: [['b', 'M8.5 19.5a5.8 5.8 0 0 1 .5-11.6 7.2 7.2 0 0 1 13.6.8 5.4 5.4 0 0 1 1.6 10.8z'], ['a', 'M16.5 15.5 11.5 23h4.2l-2.2 7 7.6-9.5h-4.3l2.2-5z']],
    gem: [['a', 'M3.5 12 9.5 4h13l6 8L16 29z'], ['b', 'M9.5 4h13l6 8h-25z'], ['l', 'M3.5 12h25M12.5 12 16 29l3.5-17M9.5 4l3 8 3.5-8 3.5 8 3-8']],
    cross: [['a', 'M12 3.5h8V12h8.5v8H20v8.5h-8V20H3.5v-8H12z'], ['w', 'M13.5 5h2v12h-2z']],
    coins: [['a', 'M5 20.5a9 3.6 0 0 0 18 0v4a9 3.6 0 0 1-18 0z'], ['b', 'M5 20.5a9 3.6 0 1 0 18 0a9 3.6 0 1 0-18 0'], ['a', 'M10 11a9 3.6 0 0 0 18 0v4a9 3.6 0 0 1-18 0z'], ['b', 'M10 11a9 3.6 0 1 0 18 0a9 3.6 0 1 0-18 0']],
    dice: [['b', 'M5 9.5 16 4l11 5.5v13L16 28 5 22.5z'], ['a', 'M16 15 27 9.5v13L16 28z'], ['l', 'M5 9.5 16 15l11-5.5M16 15v13'], ['k', 'M14.5 9.5a1.5 1 0 1 0 3 0a1.5 1 0 1 0-3 0' + C(21.3, 18, 1.3) + C(10.3, 17, 1.3)]],
    clover: [['G', 'M16 16c2 6 5.5 10 11 13'], ['a', C(11, 11, 5.2) + C(21, 11, 5.2) + C(11, 21, 5.2) + C(21, 21, 5.2)], ['b', C(16, 16, 3)]],
    chest: [['a', 'M4 14h24v14H4z'], ['b', 'M4 14c0-5 4-8.5 12-8.5S28 9 28 14z'], ['l', 'M4 14h24'], ['k', 'M14 15.5h4v5h-4z']],
    shard: [['a', 'M16 1.5l7 14.5-7 14.5-7-14.5z'], ['b', 'M16 1.5 9 16l7 14.5z'], ['l', 'M9 16h14']],
    dash: [['G', 'M4 8.5l7.5 7.5L4 23.5M13 8.5l7.5 7.5-7.5 7.5M22 8.5l4.5 7.5-4.5 7.5']],
    people: [['a', C(11, 10, 4.5) + 'M3 27c0-5 3.5-8.5 8-8.5s8 3.5 8 8.5z'], ['b', C(22, 11.5, 4) + 'M16.5 27c.5-4.5 2.5-7 5.5-7s6.5 2.5 6.5 7z']],
    // ---- the characters' skills ----
    hammer: [['G', 'M5 29 18.5 12.5'], ['a', 'M12.5 9 16.7 3.4 29.5 13 25.3 18.6z'], ['b', 'M18.6 7.3 21.4 3.6 25.2 6.4 22.4 10.2z']],
    disc: [['l', 'M2 10h6M2 16h5M2 22h6'], ['a', C(19, 16, 11)], ['b', C(19, 16, 5)], ['k', C(19, 16, 1.8)]],
    flag: [['G', 'M7 30V3'], ['a', 'M8 4h18l-4.5 6 4.5 6H8z'], ['w', 'M10 6h7l-2 3h-5z']],
    dome: [['b', 'M3 25a13 13 0 0 1 26 0z'], ['a', 'M8.5 25a7.5 7.5 0 0 1 15 0z'], ['l', 'M2 25.5h28'], ['w', 'M7 19c1-3 3.2-5 6-6.2-1.6 2-2.6 4-3 6.6z']],
    bird: [['a', 'M16 11C12 5.5 7 4.5 2 6.5c4 1 7 4 8 8l3 1-1 5 4 7 4-7-1-5 3-1c1-4 4-7 8-8-5-2-10-1-14 4.5z'], ['b', C(16, 12, 2.6)], ['k', C(16, 11.6, 0.9)]],
    bow: [['G', 'M9 3c9.5 4 9.5 22 0 26'], ['l', 'M9 3v26M4 16h21'], ['a', 'M30 16l-6.5-3.8v7.6z'], ['b', 'M3 13l3 3-3 3z']],
    fire: [['k', 'M2 13h6v6H2z'], ['a', 'M8 12c6-4 13-6 22-4-3 2-4 4-3 6 2 0 3 1 3 2s-1 2-3 2c-1 2 0 4 3 6-9 2-16 0-22-4z'], ['b', 'M9 14c5-2 9-2 13-1-2 2-2 4 0 6-4 1-8 1-13-1z']],
    dashfire: [['l', 'M2 10h7M2 16h5M2 22h7'], ['a', 'M10 16c3-7 9-11 19-12-4 4-5 7-4 10 2 0 4 1 4 2 0 2-2 3-4 3 0 3 1 5 4 7-10 0-16-3-19-10z'], ['b', 'M14 16c2-3 5-5 9-6-2 3-2 6 0 9-4-1-7-1-9-3z']],
    orb: [['b', C(16, 16, 12)], ['a', C(16, 16, 7)], ['w', C(13.5, 13.5, 2.2)]],
    beam: [['a', 'M4 19.5 25.5 7l2.5 4.3L6.5 24z'], ['b', C(5.2, 22, 4)], ['b', C(26.8, 9.2, 4)], ['k', C(26.8, 9.2, 1.5)]],
    halo: [['b', 'M16 9 25 12v6c0 5-4 9-9 11-5-2-9-6-9-11v-6z'], ['a', 'M16 12.5 21.5 14.5v3.5c0 3-2.2 5.6-5.5 7.2-3.3-1.6-5.5-4.2-5.5-7.2v-3.5z'], ['G', 'M9 5a7 2.5 0 1 0 14 0a7 2.5 0 1 0-14 0']],
    whirl: [['G', 'M7 16a9 9 0 0 1 16-5.6'], ['G', 'M25 16a9 9 0 0 1-16 5.6'], ['a', 'M22 4.5l6.5 5.5-7.5 2z'], ['a', 'M10 27.5 3.5 22l7.5-2z'], ['b', C(16, 16, 3)]],
    leap: [['G', 'M4 27C8 9 21 4 27 21'], ['a', 'M23 19.5l7.5 3.5-1.5-8z'], ['l', 'M19 29.5h12M22 26.5l-2-2M28 26.5l2-2']],
    horn: [['a', 'M4 22c6-1 12-5 17-12l4 3c-3 7-9 13-18 14z'], ['b', 'M21 10l4 3 3-6-3-2z'], ['l', 'M26 18c2 1 3 3 3 5M23.5 22c1 1 2 2.2 2 4']],
    gear: [['a', 'M14 2h4l1 4 3 1.2 3.5-2.2 2.8 2.8-2.2 3.5 1.2 3 4 1v4l-4 1-1.2 3 2.2 3.5-2.8 2.8-3.5-2.2-3 1.2-1 4h-4l-1-4-3-1.2-3.5 2.2-2.8-2.8 2.2-3.5-1.2-3-4-1v-4l4-1 1.2-3-2.2-3.5 2.8-2.8 3.5 2.2 3-1.2z'], ['b', C(16, 16, 4.5)]],
    turret: [['b', 'M6 29l2-6h16l2 6z'], ['a', 'M9 23v-7a7 7 0 0 1 14 0v7z'], ['G', 'M19 13.5 29 8'], ['k', C(16, 17, 2)]],
    mine: [['a', 'M4 22a12 5 0 0 0 24 0v-3a12 5 0 0 0-24 0z'], ['b', 'M4 19a12 5 0 1 0 24 0a12 5 0 1 0-24 0'], ['k', C(16, 15, 2.5)], ['l', 'M16 11V5M11 7l2 3M21 7l-2 3']],
    emp: [['g', 'M16 3a13 13 0 1 1 0 26a13 13 0 1 1 0-26'], ['a', 'M17.5 7 10 17.5h5.5l-2 8 9-11.5h-5.5l2-7z']],
    cannon: [['a', 'M4 17l20-9 3 6-20 9z'], ['b', C(12, 24, 5)], ['k', C(12, 24, 1.8)], ['l', 'M27 9l3-1M28 13.5l3 1']],
    dagger: [['b', 'M28 4 16.5 20 12 15.5z'], ['k', 'M8.5 15 17 23.5l-1.8 1.8-8.5-8.5z'], ['a', 'M10.5 21.5 4.5 27.5l2 2 6-6z'], ['a', C(4.5, 28, 2)]],
    mask: [['a', 'M3 10c4-2 9-3 13-3s9 1 13 3c0 7-3 13-8 15-2-2-3-4-5-4s-3 2-5 4c-5-2-8-8-8-15z'], ['k', 'M8 14c2-1 4-1 6 1-2 2-4 2-6-1zM24 14c-2-1-4-1-6 1 2 2 4 2 6-1z']],
    clock: [['b', C(16, 16, 13)], ['a', C(16, 16, 9.5)], ['l', 'M16 9v7l5 3'], ['k', C(16, 16, 1.6)]],
    rewind: [['a', 'M15.5 8 4.5 16l11 8z'], ['a', 'M27.5 8l-11 8 11 8z'], ['l', 'M3 6v20']],
    haste: [['G', 'M3 9l7 7-7 7M12 9l7 7-7 7'], ['b', 'M21 5h9v3h-9zM21 24h9v3h-9z'], ['a', 'M22 8h7c0 4-3 5-3 8s3 4 3 8h-7c0-4 3-5 3-8s-3-4-3-8z']],
    gun: [['b', 'M12 7.5h18.5v5H12z'], ['a', 'M3 7.5h11v8.5l-3.5 3-2 10.5H2.5l1.8-12.5L3 15z'], ['a', C(13, 12.5, 4.2)], ['k', C(13, 12.5, 1.4)], ['l', 'M10.5 18.5c3 0 4.5 1.5 4.5 4.5'], ['k', 'M3 4.5h3.5v3H3z']],
    fan: [['l', 'M5 16 28 6M5 16h23M5 16l23 10'], ['a', C(28, 6, 2.5) + C(28, 16, 2.5) + C(28, 26, 2.5)], ['b', 'M1.5 12.5h5v7h-5z']],
    roll: [['G', 'M6 20a10 10 0 1 1 18 4'], ['a', 'M27.5 20.5l-2 8.5-6.5-5.5z'], ['l', 'M2 29.5h13']],
    lasso: [['g', 'M8 11a8 5 0 1 0 16 0a8 5 0 1 0-16 0'], ['G', 'M10 15C8 21 13 24 18 25s8 3 9 5']],
    // ---- the ultimates ----
    castle: [['a', 'M3 29V6h2v3h3V6h2v23zM22 29V6h2v3h3V6h2v23z'], ['b', 'M10 29V14h2.5v-3h2.5v3h2v-3h2.5v3H22v15z'], ['k', 'M13 29v-5a3 3 0 0 1 6 0v5z'], ['l', 'M6.5 14v3M25.5 14v3']],
    eagle: [['a', 'M16 9C12 4 6 3 1 5c3 1 5 3 6 6-2 0-3 1-4 3 3-1 6 0 8 2l3 1-1 4 3 6 3-6-1-4 3-1c2-2 5-3 8-2-1-2-2-3-4-3 1-3 3-5 6-6-5-2-11-1-15 4z'], ['b', C(16, 11, 2.6)], ['k', 'M16 12.6l-1 2h2z']],
    phoenix: [['a', 'M16 12C13 7 8 4 2 4c3 3 5 6 6 10 2 1 4 1 6 0l-1 5c-2 2-3 5-3 9 2-2 4-3 6-3s4 1 6 3c0-4-1-7-3-9l-1-5c2 1 4 1 6 0 1-4 3-7 6-10-6 0-11 3-14 8z'], ['b', 'M16 15c1.5 2 2.5 3.5 2.5 5.5a2.5 2.5 0 0 1-5 0c0-2 1-3.5 2.5-5.5z'], ['b', C(16, 9, 2.2)]],
    angel: [['b', 'M14 13C10 9 5 8 2 9c1 4 4 8 9 9l3-1zM18 13c4-4 9-5 12-4-1 4-4 8-9 9l-3-1z'], ['a', 'M16 11l-5 18h10z'], ['a', C(16, 8, 2.6)], ['g', 'M11.5 3.2a4.5 1.5 0 1 0 9 0a4.5 1.5 0 1 0-9 0']],
    cleave: [['a', 'M2 24C5 11 15 4 29 3c-9 4-16 11-19 22z'], ['b', 'M8 27c4-9 11-15 21-18-6 4-11 10-14 18z'], ['k', C(26, 22, 1.6) + C(22, 27, 1.2)]],
    satellite: [['b', 'M3 4h8v6H3zM21 4h8v6h-8z'], ['l', 'M11 7h3M18 7h3'], ['a', 'M14 3h4v8h-4z'], ['G', 'M16 12v12'], ['k', 'M10 27a6 2 0 1 0 12 0a6 2 0 1 0-12 0']],
    pentagram: [['g', 'M16 2a14 14 0 1 1 0 28a14 14 0 1 1 0-28'], ['G', 'M16 3.5 23.3 26.1 4.1 12.1h23.8L8.7 26.1z'], ['k', C(16, 16.5, 1.8)]],
    coin: [['a', C(14, 17, 11)], ['b', C(14, 17, 7.5)], ['k', 'M14 11.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z'], ['a', C(27, 6, 3.5)]],
    // ---- the newer five ----
    wisp: [['a', 'M16 4c5 3 8 7 8 12a8 8 0 0 1-16 0c0-3 1-5 3-7 0 3 1 4 3 4-1-4 0-7 2-9z'], ['k', C(13, 17, 1.4) + C(19, 17, 1.4)]],
    raise: [['b', 'M3 29c3-4 7-6 13-6s10 2 13 6z'], ['G', 'M16 22V8M11.5 22 9 10M20.5 22 23 10M7 23l-3-6M25 23l3-6'], ['k', C(16, 8, 1.4) + C(9, 10, 1.2) + C(23, 10, 1.2)]],
    ribs: [['b', 'M16 3c-6 0-10 4-10 10v6c0 6 4 10 10 10s10-4 10-10v-6c0-6-4-10-10-10z'], ['l', 'M16 5v22M9 11c3 1 5 1 7 0 2 1 4 1 7 0M8.5 16c3 1 5 1 7.5 0 2.5 1 4.5 1 7.5 0M9 21c3 1 5 1 7 0 2 1 4 1 7 0']],
    grasp: [['a', 'M5 29c0-6 2-10 5-12l-1-9c0-1.5 2-1.5 2.3 0L13 15l.5-10c0-1.6 2.3-1.6 2.4 0l.3 10 1.6-9c.3-1.5 2.4-1.2 2.3.3L19 16l2.5-6c.5-1.4 2.6-.7 2.2.7L21 19c2 2 3 5 3 10z'], ['w', 'M9 24c0-2 1-4 2-5 0 2 0 4-1 6z']],
    gate: [['b', 'M5 29V13a11 11 0 0 1 22 0v16h-4V13a7 7 0 0 0-14 0v16z'], ['a', 'M9 29V13a7 7 0 0 1 14 0v16z'], ['k', C(16, 14, 2.2) + 'M14.5 17h3v1.6h-3z']],
    planet: [['a', C(16, 16, 8.5)], ['g', 'M2.5 19.5c2 3 9 4 15 2.5s12-5 12-8-5-3-9-2'], ['w', C(13, 12.5, 2)]],
    gravorb: [['a', C(16, 16, 6)], ['k', C(16, 16, 2.2)], ['l', 'M16 2v5M16 25v5M2 16h5M25 16h5M6 6l3.5 3.5M26 26l-3.5-3.5M26 6l-3.5 3.5M6 26l3.5-3.5']],
    repulse: [['b', C(16, 16, 4)], ['G', 'M16 10V4M16 22v6M10 16H4M22 16h6'], ['a', 'M16 1l3 4h-6zM16 31l3-4h-6zM1 16l4-3v6zM31 16l-4-3v6z']],
    blackhole: [['G', 'M16 3c7 0 13 6 13 13 0 5-4 9-9 9-4 0-7-3-7-7 0-3 2-5 5-5'], ['k', C(16, 17, 3.2)], ['g', 'M4 22c-2-6 0-12 5-16']],
    horizon: [['b', C(16, 16, 13)], ['k', C(16, 16, 7)], ['g', 'M2 16h5M25 16h5'], ['w', C(10.5, 10, 2)]],
    paw: [['a', 'M16 30c-5 0-9-3-9-7 0-3 3-6 9-6s9 3 9 6c0 4-4 7-9 7z'], ['a', C(7, 13, 3) + C(12.5, 7.5, 3) + C(19.5, 7.5, 3) + C(25, 13, 3)]],
    thorn: [['G', 'M4 28C8 20 10 14 16 10s10-4 12-8'], ['a', 'M9 19l-4-1 3-3zM14 12l-1-4 4 1zM21 8l1-4 2 4z'], ['b', 'M23 15c3-1.5 5.5-.5 6.5 1.5-3 1.5-5.5.5-6.5-1.5z']],
    claw: [['G', 'M10 3 5 27M18 3l-4 25M26 4l-4 24']],
    shift: [['G', 'M6 12a11 11 0 0 1 19-4M26 20a11 11 0 0 1-19 4'], ['a', 'M25 3v6h-6zM7 29v-6h6z'], ['b', C(16, 16, 4)]],
    grove: [['b', 'M16 3c-6 0-10 4-10 9 0 4 3 7 7 7h6c4 0 7-3 7-7 0-5-4-9-10-9z'], ['k', 'M14.5 19h3v10h-3z'], ['l', 'M8 29h16'], ['w', C(12, 9, 1.8)]],
    quake: [['a', 'M3 26l5-3 4 3 4-5 4 4 5-3 4 4v3H3z'], ['l', 'M16 3v10M10 6l3 6M22 6l-3 6']],
    worldtree: [['a', 'M16 2c-7 0-12 5-12 10 0 5 4 8 9 8h6c5 0 9-3 9-8 0-5-5-10-12-10z'], ['b', 'M14 20h4v5l4 4H10l4-4z'], ['w', C(11.5, 8, 2)]],
    katana: [['b', 'M28 3c-2 6-7 12-17 18l-1.5-1.5C17 13 22 8 28 3z'], ['k', 'M7.5 18.5l6 6-1.5 1.5-6-6z'], ['a', 'M8 23l-5 5 1.5 1.5 5-5z']],
    iai: [['l', 'M2 10h8M2 16h6M2 22h8'], ['a', 'M12 25C18 18 24 11 30 4c-2 7-7 14-16 22z']],
    parry: [['G', 'M5 5 22 22'], ['G', 'M27 5 10 22'], ['a', 'M20 24l4-4 3 3-4 4zM12 24l-4-4-3 3 4 4z']],
    windblade: [['a', 'M4 26C10 14 18 7 29 5c-8 4-14 11-17 21z'], ['l', 'M2 14h6M4 9h6']],
    triple: [['a', 'M3 10 27 4l-2 3L4 12z'], ['a', 'M3 18l26-4-1 3L4 20z'], ['a', 'M4 26l24-3-1 3-23 2z']],
    lute: [['a', C(11, 21, 8)], ['b', C(11, 21, 3)], ['G', 'M15 17 27 5'], ['k', 'M25 3l4 4-2 2-4-4z']],
    discord: [['b', 'M3 12h5l6-5v18l-6-5H3z'], ['G', 'M18 11c2 3 2 7 0 10M22 8c4 5 4 11 0 16M26 5c5 7 5 15 0 22']],
    notes: [['a', C(9, 24, 3.5) + C(22, 21, 3.5)], ['l', 'M12.5 24V7l13-3v17M12.5 11l13-3']],
    bell: [['a', 'M16 3c-5 0-8 4-8 9v7l-3 4h22l-3-4v-7c0-5-3-9-8-9z'], ['k', C(16, 26.5, 2.5)], ['w', 'M11 10c0-2 1-4 3-5-1 2-1 4-1 6z']],
    symphony: [['g', 'M16 3a13 13 0 1 1 0 26a13 13 0 1 1 0-26'], ['a', C(11, 20, 2.5) + C(21, 18, 2.5)], ['l', 'M13.5 20v-9l10-2v9']],
    // the engineer's overclock: a gear struck by lightning
    overclock: [['b', 'M14 2h4l1 4 3 1.2 3.5-2.2 2.8 2.8-2.2 3.5 1.2 3 4 1v4l-4 1-1.2 3 2.2 3.5-2.8 2.8-3.5-2.2-3 1.2-1 4h-4l-1-4-3-1.2-3.5 2.2-2.8-2.8 2.2-3.5-1.2-3-4-1v-4l4-1 1.2-3-2.2-3.5 2.8-2.8 3.5 2.2 3-1.2z'], ['a', 'M18.5 5.5 10.5 17.5h5l-2.5 9 8.5-12h-5l2.5-9z'], ['w', 'M16.8 8.6 13.2 14h1.6z']],
    // melee cards: a wide arc over the wielder, a blade with a measure, a swing back and forth
    sweep: [['a', 'M2.5 23C4.5 11.5 10 5 16 5s11.5 6.5 13.5 18c-3.5-6.5-8-10-13.5-10S6 16.5 2.5 23z'], ['b', 'M8 22.5c2-4 4.8-6 8-6s6 2 8 6c-2.6-1.6-5.2-2.4-8-2.4S10.6 20.9 8 22.5z'], ['k', C(16, 26.5, 2.4)], ['w', 'M6 16.2c1.4-3.4 3.8-6.2 7-8-1.6 2.1-2.8 4.3-3.5 6.4z']],
    reach: [['b', 'M11 17h15.5l4 3-4 3H11z'], ['l', 'M13.5 20h11'], ['k', 'M8 13.2h3v13.6H8z'], ['a', 'M2 18.3h6v3.4H2z'], ['l', 'M7.5 8.5h17'], ['a', 'M3 8.5 8.5 5v7z'], ['a', 'M29 8.5 23.5 5v7z']],
    flurry: [['a', 'M13 3.5C7 7 4 11.5 4 16s3 9 9 12.5c-3.4-3.8-5-8-5-12.5s1.6-8.7 5-12.5z'], ['b', 'M19 3.5c6 3.5 9 8 9 12.5s-3 9-9 12.5c3.4-3.8 5-8 5-12.5s-1.6-8.7-5-12.5z'], ['k', 'M16 10.5l2.6 5.5-2.6 5.5-2.6-5.5z'], ['w', 'M5.6 13.6c.6-2.6 1.8-4.6 3.6-6.4-.8 1.9-1.4 4-1.6 6.2z']],
  };

  const SW = 1.7;
  function part(p) {
    const [role, d, tf] = p;
    const t = tf ? ` transform="${tf}"` : '';
    const lj = 'stroke-linejoin="round" stroke-linecap="round"';
    switch (role) {
      case 'a': return `<path d="${d}"${t} fill="var(--ia)" stroke="var(--ik)" stroke-width="${SW}" ${lj}/>`;
      case 'b': return `<path d="${d}"${t} fill="var(--ib)" stroke="var(--ik)" stroke-width="${SW}" ${lj}/>`;
      case 'k': return `<path d="${d}"${t} fill="var(--ik)"/>`;
      case 'w': return `<path d="${d}"${t} fill="#fff" fill-opacity=".55"/>`;
      case 'l': return `<path d="${d}"${t} fill="none" stroke="var(--ik)" stroke-width="2.1" ${lj}/>`;
      default: {
        const c = role === 'G' ? 'var(--ia)' : 'var(--ib)';
        return `<path d="${d}"${t} fill="none" stroke="var(--ik)" stroke-width="5.2" ${lj}/><path d="${d}"${t} fill="none" stroke="${c}" stroke-width="2.4" ${lj}/>`;
      }
    }
  }
  const cache = {};
  G.Icons = {
    has: (name) => !!D[name],
    svg(name, cls = '') {
      const k = name + '|' + cls;
      if (!cache[k]) cache[k] = `<svg class="ico ${cls}" viewBox="0 0 32 32" aria-hidden="true">${(D[name] || D.shard).map(part).join('')}</svg>`;
      return cache[k];
    },
    // the parts alone, to set inside another drawing
    parts: (name) => (D[name] || D.shard).map(part).join(''),
  };

  // ============================================================
  // Stained-glass windows, one look per character: the art of every level-up card a character
  // draws, and the window on its card in the character picker. Each has its own colours, its own
  // pattern of leaded glass and its own emblems, drawn in the 230x340 space of a card.
  // ============================================================
  const ARCH = 'M10 330V118C10 52 56 10 115 10s105 42 105 108v212z';
  const ARCH_IN = 'M17 330V118C17 56 60 17 115 17s98 39 98 101v212z';
  const TAU = Math.PI * 2, CX = 115, CY = 92, INK = '#15110d';
  // colours: [main glass, pale glass, deep glass]; style: the pattern; ico: two emblems for the sides
  const THEMES = {
    shard: { c: ['#6f9ce8', '#cfe2ff', '#2f4f96'], style: 'diamonds', ico: ['shard', 'crystal'] },
    guardian: { c: ['#e8b84e', '#fff0c0', '#9a6a16'], style: 'sunrays', ico: ['shield', 'hammer'] },
    ranger: { c: ['#5fbf8a', '#d2f4df', '#25664a'], style: 'leaves', ico: ['bird', 'bow'] },
    pyro: { c: ['#e8663a', '#ffc98a', '#8e2418'], style: 'flames', ico: ['flame', 'fire'] },
    cleric: { c: ['#d8cfa8', '#ffffff', '#8f8358'], style: 'halo', ico: ['feather', 'halo'] },
    berserker: { c: ['#c8553a', '#ffb49a', '#6e1c12'], style: 'cross', ico: ['axe', 'drop'] },
    engineer: { c: ['#4fb8c8', '#ccf2f8', '#1f5f6c'], style: 'gears', ico: ['gear', 'turret'] },
    assassin: { c: ['#7d5cc4', '#d8c8ff', '#2e1c5e'], style: 'night', ico: ['mask', 'dagger'] },
    chrono: { c: ['#5cc8b4', '#d4fff4', '#1f6e60'], style: 'dial', ico: ['clock', 'hourglass'] },
    gunslinger: { c: ['#d8a04e', '#ffe6b0', '#7e4a16'], style: 'sunset', ico: ['gun', 'coin'] },
    necro: { c: ['#8fb84a', '#e2ffb0', '#2e4418'], style: 'bones', ico: ['skull', 'wisp'] },
    gravity: { c: ['#a45ad8', '#ecc8ff', '#3e1c66'], style: 'orbits', ico: ['planet', 'blackhole'] },
    druid: { c: ['#5aa848', '#d0f4b0', '#2c5420'], style: 'vines', ico: ['paw', 'leaf'] },
    blademaster: { c: ['#e08a3a', '#ffdcb0', '#7a3410'], style: 'cuts', ico: ['katana', 'windblade'] },
    bard: { c: ['#e07ab8', '#ffd8ee', '#7e2a62'], style: 'staff', ico: ['lute', 'notes'] },
  };
  const f1 = (v) => Math.round(v * 10) / 10;
  const poly = (pts) => 'M' + pts.map(([x, y]) => f1(x) + ' ' + f1(y)).join('L') + 'Z';
  const ring = (x, y, r) => `M${f1(x - r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0`;
  const at = (a, r, x = CX, y = CY) => [x + Math.cos(a) * r, y + Math.sin(a) * r];
  const line = (a, b) => `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;
  const flip = (pts) => pts.map(([x, y]) => [230 - x, y]);
  // wedges of glass fanning out from a point
  function fan(n, off = 0, x = CX, y = CY, k0 = 'b', k1 = 'a') {
    const out = [];
    for (let i = 0; i < n; i++) out.push([i % 2 ? k0 : k1, poly([[x, y], at(off + (i / n) * TAU, 320, x, y), at(off + ((i + 1) / n) * TAU, 320, x, y)])]);
    return out;
  }
  function leaf(x, y, a, L, W) {
    const tx = x + Math.cos(a) * L, ty = y + Math.sin(a) * L, mx = (x + tx) / 2, my = (y + ty) / 2, nx = -Math.sin(a) * W, ny = Math.cos(a) * W;
    return `M${f1(x)} ${f1(y)}Q${f1(mx + nx)} ${f1(my + ny)} ${f1(tx)} ${f1(ty)}Q${f1(mx - nx)} ${f1(my - ny)} ${f1(x)} ${f1(y)}Z`;
  }
  function star4(x, y, r) { return poly([[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28], [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]]); }
  function gear(x, y, r, n) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU, rr = i % 2 ? r * 0.78 : r; pts.push(at(a - 0.12, rr, x, y), at(a + 0.12, rr, x, y)); }
    return poly(pts);
  }
  function flame(x, w, top, lean, base = 210) {
    const m = (base + top) / 2 + 8;
    return `M${f1(x - w)} ${base}C${f1(x - w)} ${f1(m)} ${f1(x + lean - w * 0.25)} ${f1(top + 34)} ${f1(x + lean)} ${f1(top)}C${f1(x + lean + w * 0.25)} ${f1(top + 34)} ${f1(x + w)} ${f1(m)} ${f1(x + w)} ${base}Z`;
  }
  const ellipse = (x, y, rx, ry, deg) => {
    const a = (deg * Math.PI) / 180, dx = Math.cos(a) * rx, dy = Math.sin(a) * rx;
    return `M${f1(x - dx)} ${f1(y - dy)}A${rx} ${ry} ${deg} 1 0 ${f1(x + dx)} ${f1(y + dy)}A${rx} ${ry} ${deg} 1 0 ${f1(x - dx)} ${f1(y - dy)}`;
  };
  const both = (fn) => [...fn(1), ...fn(-1)];
  // the patterns; parts are [kind, path]: a/b/c glass (main, pale, deep) leaded in ink, w a glint,
  // k ink, l a lead line, sb/sc a thick band of pale/deep glass (outlined), bone a bone
  const STYLES = {
    diamonds() {
      const out = [];
      for (let r = -1; r < 6; r++) for (let q = -1; q < 7; q++) {
        const x = q * 40 + (r % 2 ? 20 : 0), y = r * 44 + 10;
        out.push([(q + r) % 3 === 0 ? 'b' : (q + r) % 3 === 1 ? 'a' : 'c', poly([[x, y - 22], [x + 20, y], [x, y + 22], [x - 20, y]])]);
      }
      out.push(...both((s) => [['w', poly(s > 0 ? [[22, 205], [34, 120], [44, 205]] : flip([[22, 205], [34, 120], [44, 205]]))], ['b', poly(s > 0 ? [[44, 205], [58, 150], [66, 205]] : flip([[44, 205], [58, 150], [66, 205]]))]]));
      return out;
    },
    sunrays() {
      return [...fan(20, -Math.PI / 2), ['l', ring(CX, CY, 78)], ['sb', ring(CX, CY, 90)], ['l', ring(CX, CY, 104)]];
    },
    halo() {
      const out = [...fan(32, 0.05, CX, CY, 'b', 'a'), ['sb', ring(CX, CY, 66)], ['w', ring(CX, CY, 64)]];
      for (const [x, y] of [[34, 70], [196, 70], [40, 150], [190, 150]]) out.push(['b', poly([[x - 4, y - 14], [x + 4, y - 14], [x + 4, y - 4], [x + 14, y - 4], [x + 14, y + 4], [x + 4, y + 4], [x + 4, y + 14], [x - 4, y + 14], [x - 4, y + 4], [x - 14, y + 4], [x - 14, y - 4], [x - 4, y - 4]])]);
      return out;
    },
    leaves() {
      const out = [];
      for (let i = 0; i < 10; i++) out.push([i % 2 ? 'a' : 'c', poly([[10 + i * 21, 10], [31 + i * 21, 10], [31 + i * 21, 330], [10 + i * 21, 330]])]);
      out.push(...both((s) => {
        const o = [], X = (x) => (s > 0 ? x : 230 - x);
        o.push(['l', `M${X(20)} 210Q${X(18)} 120 ${X(70)} 40`]);
        for (let i = 0; i < 7; i++) {
          const t = i / 6, x = X(20 + t * 46 - Math.sin(t * Math.PI) * 6), y = 200 - t * 150, side = i % 2 ? 1 : -1;
          o.push([i % 3 ? 'b' : 'a', leaf(x, y, (s > 0 ? -Math.PI / 2 : -Math.PI / 2) + side * 0.9 * s, 26, 9)]);
        }
        return o;
      }));
      return out;
    },
    flames() {
      const out = [...fan(14, -Math.PI / 2, CX, 220, 'c', 'a')];
      out.push(...both((s) => {
        const X = (x) => (s > 0 ? x : 230 - x), L = s > 0 ? 1 : -1;
        return [['c', flame(X(30), 20, 36, 6 * L)], ['a', flame(X(64), 16, 70, -4 * L)], ['b', flame(X(30), 10, 76, 4 * L)], ['b', flame(X(64), 8, 108, -2 * L)], ['w', flame(X(30), 4, 120, 2 * L)]];
      }));
      out.push(['b', flame(115, 22, 150, 0, 214)], ['w', flame(115, 9, 168, 0, 214)]);
      return out;
    },
    cross() {
      const out = [...fan(8, Math.PI / 8, CX, CY, 'c', 'a')];
      out.push(['sb', line([-20, 0], [250, 250])], ['sb', line([250, 0], [-20, 250])]);
      for (const [x, y] of [[30, 140], [200, 140], [50, 176], [180, 176], [115, 176]]) out.push(['c', `M${x} ${y - 10}C${x + 7} ${y - 1} ${x + 7} ${y + 9} ${x} ${y + 9}C${x - 7} ${y + 9} ${x - 7} ${y - 1} ${x} ${y - 10}Z`]);
      return out;
    },
    gears() {
      const out = [];
      for (let r = 0; r < 9; r++) for (let q = 0; q < 6; q++) out.push([(q + r) % 2 ? 'a' : 'c', poly([[10 + q * 36, 10 + r * 36], [46 + q * 36, 10 + r * 36], [46 + q * 36, 46 + r * 36], [10 + q * 36, 46 + r * 36]])]);
      for (const [x, y, rr, n] of [[38, 62, 27, 9], [194, 62, 27, 9], [26, 150, 18, 7], [206, 150, 18, 7]]) out.push(['b', gear(x, y, rr, n)], ['a', ring(x, y, rr * 0.45)], ['k', ring(x, y, rr * 0.16)]);
      out.push(['l', 'M64 186h18v-26h14'], ['l', 'M166 186h-18v-26h-14'], ['k', ring(96, 160, 4)], ['k', ring(134, 160, 4)]);
      return out;
    },
    night() {
      const out = [['c', 'M0 0H230V340H0Z'], ['a', ring(46, 52, 30)], ['c', ring(60, 44, 26)]];
      for (const [x, y, r] of [[186, 40, 9], [204, 92, 6], [160, 22, 5], [24, 120, 6], [206, 150, 8], [40, 176, 5], [182, 186, 5]]) out.push([r > 6 ? 'b' : 'w', star4(x, y, r)]);
      out.push(...both((s) => {
        const P = (pts) => poly(s > 0 ? pts : flip(pts));
        return [['b', P([[18, 206], [30, 150], [36, 152], [30, 208]])], ['k', P([[14, 152], [44, 160], [42, 166], [12, 158]])]];
      }));
      return out;
    },
    dial() {
      const out = [...fan(12, -Math.PI / 2 + Math.PI / 12, CX, CY, 'a', 'b'), ['sb', ring(CX, CY, 70)], ['l', ring(CX, CY, 86)]];
      for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + (i / 12) * TAU; out.push(['l', line(at(a, 60), at(a, i % 3 ? 74 : 82))]); }
      out.push(...both((s) => { const P = (pts) => poly(s > 0 ? pts : flip(pts)); return [['b', P([[14, 160], [52, 160], [33, 186]])], ['c', P([[14, 212], [52, 212], [33, 186]])]]; }));
      return out;
    },
    sunset() {
      const out = [['c', 'M0 0H230V44H0Z'], ['a', 'M0 44H230V88H0Z'], ['b', 'M0 88H230V128H0Z'], ['a', 'M0 128H230V170H0Z'], ['c', 'M0 170H230V340H0Z']];
      out.push(['b', ring(CX, CY, 74)]);
      for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; out.push(['l', line(at(a, 80), at(a, 112))]); }
      out.push(['c', poly([[10, 214], [10, 150], [40, 150], [44, 166], [70, 166], [74, 214]])], ['c', poly(flip([[10, 214], [10, 158], [34, 158], [38, 174], [62, 174], [66, 214]]))]);
      return out;
    },
    bones() {
      const out = [];
      for (let i = 0; i < 7; i++) out.push([i % 2 ? 'c' : 'a', poly([[10 + i * 30, 330], [10 + i * 30, 44], [25 + i * 30, 26], [40 + i * 30, 44], [40 + i * 30, 330]])]);
      for (let i = 0; i < 4; i++) out.push(['l', `M${50 - i * 6} ${34 + i * 12}Q115 ${-4 + i * 12} ${180 + i * 6} ${34 + i * 12}`]);
      out.push(['bone', [20, 120, 60, 176]], ['bone', [60, 120, 20, 176]], ['bone', [170, 120, 210, 176]], ['bone', [210, 120, 170, 176]]);
      for (const x of [40, 190]) out.push(['b', ring(x, 92, 11)], ['k', ring(x - 4, 91, 2.6) + ring(x + 4, 91, 2.6)]);
      return out;
    },
    orbits() {
      const out = [...fan(10, 0.2, CX, CY, 'c', 'a')];
      for (const [rx, ry, d] of [[104, 30, -18], [96, 26, 24], [112, 40, 64]]) out.push(['sb', ellipse(CX, CY, rx, ry, d)]);
      for (const [x, y, r] of [[22, 66, 10], [206, 116, 8], [62, 174, 7], [176, 30, 6], [190, 172, 5]]) out.push(['b', ring(x, y, r)], ['w', ring(x - r * 0.3, y - r * 0.3, r * 0.35)]);
      return out;
    },
    vines() {
      const out = [...fan(8, -Math.PI / 2, CX, 260, 'a', 'c')];
      out.push(...both((s) => {
        const X = (x) => (s > 0 ? x : 230 - x);
        const o = [['l', `M${X(26)} 214C${X(10)} 150 ${X(60)} 120 ${X(40)} 80S${X(60)} 24 ${X(96)} 24`], ['l', `M${X(40)} 80c${s * -18} -4 ${s * -22} 14 ${s * -10} 22s${s * 18} 2 ${s * 12} -10`]];
        for (const [x, y, a] of [[26, 190, -2.2], [30, 150, -0.6], [48, 110, -2.4], [44, 62, -0.5], [74, 30, -2.6]]) o.push([y % 4 ? 'b' : 'a', leaf(X(x), y, s > 0 ? a : Math.PI - a, 24, 11)]);
        return o;
      }));
      return out;
    },
    cuts() {
      const out = [['b', 'M0 0H230V64H0Z'], ['a', 'M0 64H230V130H0Z'], ['c', 'M0 130H230V340H0Z']];
      for (const [x0, y0, w] of [[-30, 150, 9], [-10, 200, 6], [40, 210, 5]]) {
        const a = -0.62, dx = Math.cos(a) * 340, dy = Math.sin(a) * 340, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
        out.push(['w', poly([[x0 - nx, y0 - ny], [x0 + dx - nx, y0 + dy - ny], [x0 + dx + nx, y0 + dy + ny], [x0 + nx, y0 + ny]])]);
      }
      out.push(['l', 'M14 120q30 -22 60 -6'], ['l', 'M156 168q30 -22 60 -6'], ['l', 'M150 40q24 -18 50 -4']);
      return out;
    },
    staff() {
      const out = [];
      for (let i = 0; i < 6; i++) out.push([i % 2 ? 'a' : 'b', `M0 ${f1(10 + i * 38)}Q57 ${f1(-6 + i * 38)} 115 ${f1(10 + i * 38)}T230 ${f1(10 + i * 38)}V${f1(48 + i * 38)}Q173 ${f1(64 + i * 38)} 115 ${f1(48 + i * 38)}T0 ${f1(48 + i * 38)}Z`]);
      for (let i = 0; i < 5; i++) out.push(['l', `M8 ${150 + i * 9}C70 ${128 + i * 9} 160 ${178 + i * 9} 222 ${152 + i * 9}`]);
      for (const [x, y] of [[40, 150], [74, 162], [158, 168], [192, 158]]) out.push(['k', ellipse(x, y, 7, 5, -20)], ['l', `M${x + 6} ${y - 2}v-34`]);
      out.push(['l', 'M198 124l14 -6'], ['b', star4(30, 62, 9)], ['b', star4(200, 62, 9)]);
      return out;
    },
  };
  function paint(parts, th) {
    const [ca, cb, cc] = th.c;
    const col = { a: ca, b: cb, c: cc };
    return parts.map(([k, d]) => {
      if (k === 'l') return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (k === 'w') return `<path d="${d}" fill="#fff" fill-opacity=".5" stroke="${INK}" stroke-width="2"/>`;
      if (k === 'k') return `<path d="${d}" fill="${INK}"/>`;
      if (k === 'sb' || k === 'sc') return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${k === 'sb' ? cb : cc}" stroke-width="9" stroke-linecap="round"/>`;
      if (k === 'bone') {
        const [x1, y1, x2, y2] = d, L = `M${x1} ${y1}L${x2} ${y2}`, dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy), nx = (-dy / l) * 4.5, ny = (dx / l) * 4.5;
        const knobs = [[x1, y1], [x2, y2]].map(([x, y]) => ring(x + nx, y + ny, 5.5) + ring(x - nx, y - ny, 5.5)).join('');
        return `<path d="${L}" stroke="${INK}" stroke-width="13" stroke-linecap="round"/><path d="${knobs}" fill="${cb}" stroke="${INK}" stroke-width="2.5"/><path d="${L}" stroke="${cb}" stroke-width="7" stroke-linecap="round"/>`;
      }
      return `<path d="${d}" fill="${col[k]}" fill-rule="evenodd" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    }).join('');
  }
  let winN = 0;
  const winCache = {};
  // o.side: the two emblems on each side (cards); o.medal: the character's emblem in the middle
  // (the picker); o.rim: a rarity-coloured rim inside the frame (var(--g), set by the card)
  G.Icons.window = function (id, o = {}) {
    const th = THEMES[id] || THEMES.shard, key = id + '|' + (o.side ? 1 : 0) + (o.medal ? 1 : 0);
    if (!winCache[key]) {
      let art = paint(STYLES[th.style](), th);
      if (o.side) {
        // little medallions of the character's emblems, set into the glass at both sides
        for (const [x, y, s, r, n] of [[38, 62, 38, -10, 0], [36, 150, 30, 8, 1], [192, 62, 38, 10, 0], [194, 150, 30, -8, 1]]) {
          art += `<circle cx="${x}" cy="${y}" r="${s / 2 + 5}" fill="${th.c[1]}" stroke="${INK}" stroke-width="3.5"/>` +
            `<g transform="translate(${x - s / 2} ${y - s / 2}) scale(${s / 32}) rotate(${r} 16 16)" style="--ia:${th.c[0]};--ib:${th.c[1]};--ik:${INK}">${G.Icons.parts(th.ico[n])}</g>`;
        }
      }
      if (o.medal) {
        const emb = (G.Classes && G.Classes.list[id] && G.Classes.list[id].emblem) || th.ico[0];
        art += `<circle cx="${CX}" cy="${CY}" r="50" fill="${th.c[1]}" stroke="${INK}" stroke-width="6"/><circle cx="${CX}" cy="${CY}" r="56" fill="none" stroke="${th.c[2]}" stroke-width="3"/>` +
          `<g transform="translate(${CX - 34} ${CY - 34}) scale(${68 / 32})" style="--ia:${th.c[0]};--ib:#fff;--ik:${INK}">${G.Icons.parts(emb)}</g>`;
      }
      winCache[key] = art;
    }
    const cid = 'cw' + ++winN;
    return `<defs><clipPath id="${cid}"><path d="${ARCH}"/></clipPath></defs><path d="${ARCH}" fill="${th.c[0]}"/>` +
      `<g clip-path="url(#${cid})">${winCache[key]}</g>` + (o.rim ? `<path d="${ARCH_IN}" fill="none" stroke="var(--g)" stroke-width="6"/>` : '') + `<path d="${ARCH}" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>`;
  };
  G.Icons.theme = (id) => THEMES[id] || THEMES.shard;
})();
