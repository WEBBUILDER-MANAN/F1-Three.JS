// Four famous 2022-era F1 cars, each defined for the SDF sculpting engine:
// palette (material id -> RGB), shape parameters (sidepod philosophy, engine
// cover, fin, wing colours, nose paint bands) and decal layouts.
import { M } from './carSculpt.js';

const RB = {
  id: 'redbull',
  name: '红牛 RB18', short: 'RB18', number: 1,
  fullName: 'Oracle Red Bull Racing RB18',
  year: 2022, driverNote: '2022 年世界冠军座驾',
  desc: '下洗式侧箱 + 高耙姿态，全季 17 胜的统治级赛车。',
  uiColor: '#1c2d66', uiColor2: '#ffd400', uiText: '#ffd400',
  palette: {
    1: [28, 45, 102], 2: [204, 24, 48], 3: [255, 198, 0], 4: [236, 239, 246],
    5: [31, 32, 38], 6: [27, 26, 28], 7: [188, 30, 40], 8: [145, 150, 160],
    9: [56, 58, 66], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [27, 38, 80], 16: [172, 26, 46],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [238, 242, 248], 20: [16, 20, 30],
    21: [204, 24, 48],
  },
  shape: {
    sidepod: 'downwash', podX0: -1.78, podW: 0.705, podTop: 0.565, podTopPow: 1.12,
    inletH: 0.125, podStripe: M.ACC1,
    spineW: 0.27, spineTop: 0.885, spinePow: 1.85,
    finX0: -2.24, finX1: -1.32, finTop: 0.685, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.BODY],
      [2.355, 2.645, 0.212, 0.115, M.BODY],
    ],
    fwTipMat: M.BODY, epTop: M.ACC1, epMain: M.BODY, epRear: M.BODY,
    rwMat: M.BODY, floorEdge: M.CARB, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.50 ? M.ACC2 : x > 2.42 ? M.ACC1 : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'RED BULL', x0: -0.92, yTop: 0.385, px: 0.0165, zMin: 0.46, color: M.ACC1 },
    { kind: 'sideText', text: 'RED BULL', x0: -2.20, yTop: 0.662, px: 0.017, zMin: 0.005, color: M.WHT },
    { kind: 'circle', cx: -0.99, cy: 0.49, r: 0.142, zMin: 0.03, color: M.ACC2 },
    { kind: 'sideLogo', logo: 'bull', cols: 26, rows: 13, x0: -1.285, yTop: 0.632, px: 0.023, zMin: 0.03, color: M.ACC1 },
    { kind: 'noseNumber', text: '1', xRear: 2.135, px: 0.030, color: M.WHT },
    { kind: 'epNumber', text: '1', x0: -2.44, yTop: 0.87, px: 0.036, color: M.ACC2, only: M.BODY },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'RED BULL', yTop: 0.938, px: 0.0185, color: M.WHT, only: M.BODY },
  ],
};

const FER = {
  id: 'ferrari',
  name: '法拉利 F1-75', short: 'F1-75', number: 16,
  fullName: 'Scuderia Ferrari F1-75',
  year: 2022, driverNote: '车队成立 75 周年纪念之作',
  desc: '标志性「浴缸式」侧箱进气槽，赛季 4 胜的红色艺术品。',
  uiColor: '#d01018', uiColor2: '#ffd200', uiText: '#ffd200',
  palette: {
    1: [208, 16, 24], 2: [20, 20, 26], 3: [255, 210, 0], 4: [238, 240, 246],
    5: [30, 31, 36], 6: [27, 26, 28], 7: [188, 30, 40], 8: [40, 42, 48],
    9: [70, 72, 80], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [26, 27, 33], 16: [150, 16, 26],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [198, 20, 36], 20: [16, 20, 30],
    21: [255, 210, 0],
  },
  shape: {
    sidepod: 'bathtub', podX0: -1.62, podW: 0.72, podTop: 0.575, podTopPow: 1.0,
    inletH: 0.115, podStripe: M.BODY,
    spineW: 0.29, spineTop: 0.86, spinePow: 1.6,
    finX0: -2.22, finX1: -1.45, finTop: 0.66, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.CARB],
      [2.355, 2.645, 0.212, 0.115, M.BODY],
    ],
    fwTipMat: M.CARB, epTop: M.ACC2, epMain: M.CARB, epRear: M.BODY,
    rwMat: M.BODY, floorEdge: M.CARB, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.56 ? M.CARB : x > 2.47 ? M.WHT : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'FERRARI', x0: -0.90, yTop: 0.385, px: 0.0175, zMin: 0.46, color: M.WHT },
    { kind: 'sideLogo', logo: 'horse', cols: 17, rows: 16, x0: -1.18, yTop: 0.655, px: 0.020, zMin: 0.03, color: M.ACC1 },
    { kind: 'noseNumber', text: '16', xRear: 2.10, px: 0.026, color: M.WHT },
    { kind: 'epNumber', text: '16', x0: -2.50, yTop: 0.87, px: 0.034, color: M.ACC2, only: M.BODY },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'FERRARI', yTop: 0.938, px: 0.0185, color: M.WHT, only: M.BODY },
  ],
};

const MER = {
  id: 'mercedes',
  name: '梅赛德斯 W13', short: 'W13', number: 44,
  fullName: 'Mercedes-AMG F1 W13 E Performance',
  year: 2022, driverNote: '激进「零侧箱」概念',
  desc: '史上最极端的零侧箱设计，银箭空气动力学的大胆实验。',
  uiColor: '#9ba2ab', uiColor2: '#00a89a', uiText: '#00e5d0',
  palette: {
    1: [186, 192, 200], 2: [0, 168, 152], 3: [12, 14, 18], 4: [240, 242, 248],
    5: [30, 31, 36], 6: [27, 26, 28], 7: [188, 30, 40], 8: [40, 42, 48],
    9: [70, 72, 80], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [22, 24, 30], 16: [60, 64, 72],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [250, 210, 30], 20: [16, 20, 30],
    21: [214, 10, 30],
  },
  shape: {
    sidepod: 'zeropod', podX0: -1.60, podW: 0.60, podTop: 0.545, podTopPow: 1.1,
    inletH: 0.10, podStripe: M.ACC1,
    spineW: 0.25, spineTop: 0.87, spinePow: 2.0,
    finX0: -2.24, finX1: -1.38, finTop: 0.67, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.BODY],
      [2.355, 2.645, 0.212, 0.115, M.BODY],
    ],
    fwTipMat: M.CARB, epTop: M.ACC1, epMain: M.CARB, epRear: M.BODY,
    rwMat: M.CARB, floorEdge: M.ACC1, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.55 ? M.CARB : x > 2.44 ? M.ACC1 : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'AMG', x0: -0.56, yTop: 0.40, px: 0.024, zMin: 0.26, color: M.ACC3 },
    { kind: 'sideLogo', logo: 'star', cols: 13, rows: 12, x0: -1.12, yTop: 0.645, px: 0.022, zMin: 0.03, color: M.ACC1 },
    { kind: 'sideText', text: 'W13', x0: -2.05, yTop: 0.655, px: 0.020, zMin: 0.005, color: M.ACC1 },
    { kind: 'noseNumber', text: '44', xRear: 2.10, px: 0.026, color: M.ACC3 },
    { kind: 'epNumber', text: '44', x0: -2.50, yTop: 0.87, px: 0.034, color: M.ACC3, only: M.BODY },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'AMG', yTop: 0.938, px: 0.0185, color: M.WHT, only: M.CARB },
  ],
};

const MCL = {
  id: 'mclaren',
  name: '迈凯伦 MCL36', short: 'MCL36', number: 4,
  fullName: 'McLaren F1 Team MCL36',
  year: 2022, driverNote: '木瓜橙涂装 · 挑战者之姿',
  desc: '深度下切侧箱与拉杆前悬，木瓜军团的锐利武器。',
  uiColor: '#ff8000', uiColor2: '#47c7fc', uiText: '#47c7fc',
  palette: {
    1: [255, 128, 8], 2: [0, 165, 235], 3: [18, 20, 26], 4: [240, 242, 248],
    5: [30, 31, 36], 6: [27, 26, 28], 7: [188, 30, 40], 8: [40, 42, 48],
    9: [70, 72, 80], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [24, 26, 32], 16: [190, 92, 8],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [10, 40, 90], 20: [16, 20, 30],
    21: [255, 128, 8],
  },
  shape: {
    sidepod: 'undercut', podX0: -1.72, podW: 0.70, podTop: 0.56, podTopPow: 1.15,
    inletH: 0.12, podStripe: M.ACC2,
    spineW: 0.27, spineTop: 0.88, spinePow: 1.85,
    finX0: -2.24, finX1: -1.34, finTop: 0.68, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.BODY],
      [2.355, 2.645, 0.212, 0.115, M.BODY],
    ],
    fwTipMat: M.BODY, epTop: M.ACC1, epMain: M.BODY, epRear: M.ACC2,
    rwMat: M.BODY, floorEdge: M.ACC1, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.52 ? M.ACC1 : x > 2.40 ? M.ACC2 : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'MCLAREN', x0: -1.00, yTop: 0.385, px: 0.016, zMin: 0.46, color: M.WHT },
    { kind: 'sideLogo', logo: 'swoosh', cols: 18, rows: 8, x0: -1.18, yTop: 0.60, px: 0.028, zMin: 0.03, color: M.ACC1 },
    { kind: 'sideText', text: 'MCLAREN', x0: -2.18, yTop: 0.665, px: 0.017, zMin: 0.005, color: M.ACC2 },
    { kind: 'noseNumber', text: '4', xRear: 2.135, px: 0.030, color: M.WHT },
    { kind: 'epNumber', text: '4', x0: -2.42, yTop: 0.86, px: 0.036, color: M.BODY, only: M.ACC2 },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'MCLAREN', yTop: 0.938, px: 0.017, color: M.ACC2, only: M.BODY },
  ],
};


const ALP = {
  id: 'alpine',
  name: 'Alpine A522', short: 'A522', number: 14,
  fullName: 'BWT Alpine F1 Team A522',
  year: 2022, driverNote: '法国蓝 × BWT 粉',
  desc: '雷诺厂队的法兰西蓝箭，深下切侧箱与粉色点缀。',
  uiColor: '#0e3aa8', uiColor2: '#ec4096', uiText: '#ec4096',
  palette: {
    1: [14, 58, 168], 2: [236, 64, 150], 3: [240, 242, 248], 4: [238, 240, 246],
    5: [31, 32, 38], 6: [27, 26, 28], 7: [188, 30, 40], 8: [40, 42, 50],
    9: [70, 72, 80], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [16, 26, 60], 16: [170, 34, 108],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [236, 64, 150], 20: [16, 20, 30],
    21: [240, 242, 248],
  },
  shape: {
    sidepod: 'undercut', podX0: -1.70, podW: 0.71, podTop: 0.565, podTopPow: 1.15,
    inletH: 0.12, podStripe: M.ACC1,
    spineW: 0.27, spineTop: 0.87, spinePow: 1.85,
    finX0: -2.24, finX1: -1.36, finTop: 0.675, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.BODY],
      [2.355, 2.645, 0.212, 0.115, M.BODY],
    ],
    fwTipMat: M.BODY, epTop: M.ACC1, epMain: M.BODY, epRear: M.BODY,
    rwMat: M.BODY, floorEdge: M.ACC1, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.54 ? M.ACC1 : x > 2.44 ? M.WHT : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'ALPINE', x0: -0.88, yTop: 0.385, px: 0.019, zMin: 0.46, color: M.WHT },
    { kind: 'sideText', text: 'ALPINE', x0: -2.12, yTop: 0.662, px: 0.017, zMin: 0.005, color: M.WHT },
    { kind: 'noseNumber', text: '14', xRear: 2.10, px: 0.026, color: M.WHT },
    { kind: 'epNumber', text: '14', x0: -2.50, yTop: 0.87, px: 0.034, color: M.ACC1, only: M.BODY },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'ALPINE', yTop: 0.938, px: 0.0185, color: M.WHT, only: M.BODY },
  ],
};

const AMR = {
  id: 'astonmartin',
  name: '阿斯顿·马丁 AMR22', short: 'AMR22', number: 5,
  fullName: 'Aston Martin Aramco AMR22',
  year: 2022, driverNote: '英国赛车绿 · 青柠饰线',
  desc: '赛季中改款的「绿色下洗」概念，优雅的英国绿涂装。',
  uiColor: '#075a42', uiColor2: '#a8dc28', uiText: '#a8dc28',
  palette: {
    1: [7, 86, 64], 2: [168, 220, 40], 3: [238, 240, 246], 4: [238, 240, 246],
    5: [31, 32, 38], 6: [27, 26, 28], 7: [188, 30, 40], 8: [30, 34, 32],
    9: [70, 72, 80], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [6, 56, 42], 16: [10, 100, 74],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [12, 110, 80], 20: [16, 20, 30],
    21: [168, 220, 40],
  },
  shape: {
    sidepod: 'downwash', podX0: -1.78, podW: 0.705, podTop: 0.565, podTopPow: 1.12,
    inletH: 0.125, podStripe: M.ACC1,
    spineW: 0.27, spineTop: 0.88, spinePow: 1.85,
    finX0: -2.24, finX1: -1.34, finTop: 0.685, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.BODY],
      [2.355, 2.645, 0.212, 0.115, M.BODY],
    ],
    fwTipMat: M.BODY, epTop: M.ACC1, epMain: M.BODY, epRear: M.BODY,
    rwMat: M.BODY, floorEdge: M.ACC1, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.54 ? M.ACC1 : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'ASTON MARTIN', x0: -0.93, yTop: 0.385, px: 0.012, zMin: 0.46, color: M.WHT },
    { kind: 'sideText', text: 'ASTON MARTIN', x0: -2.20, yTop: 0.660, px: 0.012, zMin: 0.005, color: M.WHT },
    { kind: 'noseNumber', text: '5', xRear: 2.135, px: 0.030, color: M.WHT },
    { kind: 'epNumber', text: '5', x0: -2.44, yTop: 0.87, px: 0.036, color: M.ACC1, only: M.BODY },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'ASTON MARTIN', yTop: 0.936, px: 0.0125, color: M.WHT, only: M.BODY },
  ],
};

const WIL = {
  id: 'williams',
  name: '威廉姆斯 FW44', short: 'FW44', number: 23,
  fullName: 'Williams Racing FW44',
  year: 2022, driverNote: '独立车队的荣光传承',
  desc: '平板式宽侧箱的实验路线，深蓝与天蓝的电光涂装。',
  uiColor: '#0c2c7e', uiColor2: '#4eb2f0', uiText: '#4eb2f0',
  palette: {
    1: [12, 44, 126], 2: [78, 178, 240], 3: [238, 240, 246], 4: [238, 240, 246],
    5: [31, 32, 38], 6: [27, 26, 28], 7: [188, 30, 40], 8: [36, 40, 52],
    9: [70, 72, 80], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [10, 34, 96], 16: [40, 120, 190],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [78, 178, 240], 20: [16, 20, 30],
    21: [230, 50, 60],
  },
  shape: {
    sidepod: 'slab', podX0: -1.72, podW: 0.72, podTop: 0.575, podTopPow: 1.0,
    inletH: 0.13, podStripe: M.ACC1,
    spineW: 0.28, spineTop: 0.87, spinePow: 1.7,
    finX0: -2.24, finX1: -1.38, finTop: 0.68, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.BODY],
      [2.355, 2.645, 0.212, 0.115, M.BODY],
    ],
    fwTipMat: M.ACC1, epTop: M.ACC1, epMain: M.BODY, epRear: M.BODY,
    rwMat: M.BODY, floorEdge: M.ACC1, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.55 ? M.ACC1 : x > 2.45 ? M.WHT : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'WILLIAMS', x0: -0.90, yTop: 0.385, px: 0.016, zMin: 0.46, color: M.WHT },
    { kind: 'sideText', text: 'WILLIAMS', x0: -2.14, yTop: 0.662, px: 0.016, zMin: 0.005, color: M.ACC1 },
    { kind: 'noseNumber', text: '23', xRear: 2.10, px: 0.026, color: M.WHT },
    { kind: 'epNumber', text: '23', x0: -2.50, yTop: 0.87, px: 0.034, color: M.ACC2, only: M.BODY },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'WILLIAMS', yTop: 0.938, px: 0.016, color: M.WHT, only: M.BODY },
  ],
};

const ALF = {
  id: 'alfaromeo',
  name: '阿尔法·罗密欧 C42', short: 'C42', number: 77,
  fullName: 'Alfa Romeo F1 Team ORLEN C42',
  year: 2022, driverNote: '酒红与纯白的百年徽章',
  desc: '轻量化冠军底盘，白色前段划过酒红车尾。',
  uiColor: '#74101f', uiColor2: '#eef0f6', uiText: '#eef0f6',
  palette: {
    1: [116, 16, 34], 2: [238, 240, 246], 3: [20, 110, 70], 4: [238, 240, 246],
    5: [31, 32, 38], 6: [27, 26, 28], 7: [188, 30, 40], 8: [225, 228, 232],
    9: [90, 94, 100], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [90, 12, 26], 16: [150, 20, 40],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [238, 240, 246], 20: [16, 20, 30],
    21: [238, 240, 246],
  },
  shape: {
    sidepod: 'undercut', podX0: -1.66, podW: 0.685, podTop: 0.56, podTopPow: 1.2,
    inletH: 0.115, podStripe: M.BODY,
    spineW: 0.27, spineTop: 0.86, spinePow: 1.8,
    finX0: -2.22, finX1: -1.40, finTop: 0.665, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.ACC1],
      [2.355, 2.645, 0.212, 0.115, M.ACC1],
    ],
    fwTipMat: M.ACC1, epTop: M.ACC3, epMain: M.ACC1, epRear: M.BODY,
    rwMat: M.BODY, floorEdge: M.CARB, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.42 ? M.ACC1 : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'ALFA ROMEO', x0: -0.90, yTop: 0.385, px: 0.014, zMin: 0.46, color: M.ACC1 },
    { kind: 'sideText', text: 'C42', x0: -1.98, yTop: 0.655, px: 0.020, zMin: 0.005, color: M.ACC1 },
    { kind: 'noseNumber', text: '77', xRear: 2.44, px: 0.024, color: M.BODY, only: M.ACC1 },
    { kind: 'epNumber', text: '77', x0: -2.50, yTop: 0.87, px: 0.034, color: M.ACC1, only: M.BODY },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'ALFA ROMEO', yTop: 0.938, px: 0.014, color: M.ACC1, only: M.BODY },
  ],
};

const ATR = {
  id: 'alphatauri',
  name: 'AlphaTauri AT03', short: 'AT03', number: 10,
  fullName: 'Scuderia AlphaTauri AT03',
  year: 2022, driverNote: '深蓝时装厂牌',
  desc: '红牛青训军团的深蓝战衣，干净利落的白色勾线。',
  uiColor: '#1a2658', uiColor2: '#eef0f6', uiText: '#eef0f6',
  palette: {
    1: [26, 38, 88], 2: [238, 240, 246], 3: [150, 160, 175], 4: [238, 240, 246],
    5: [31, 32, 38], 6: [27, 26, 28], 7: [188, 30, 40], 8: [44, 48, 62],
    9: [70, 72, 80], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [18, 28, 66], 16: [30, 44, 100],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [238, 240, 246], 20: [16, 20, 30],
    21: [238, 240, 246],
  },
  shape: {
    sidepod: 'downwash', podX0: -1.74, podW: 0.69, podTop: 0.555, podTopPow: 1.1,
    inletH: 0.115, podStripe: M.ACC1,
    spineW: 0.26, spineTop: 0.87, spinePow: 1.9,
    finX0: -2.24, finX1: -1.36, finTop: 0.675, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.CARB],
      [2.355, 2.645, 0.212, 0.115, M.BODY],
    ],
    fwTipMat: M.BODY, epTop: M.ACC1, epMain: M.BODY, epRear: M.BODY,
    rwMat: M.BODY, floorEdge: M.ACC1, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.50 ? M.ACC1 : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'ALPHATAURI', x0: -0.92, yTop: 0.385, px: 0.014, zMin: 0.46, color: M.ACC1 },
    { kind: 'sideText', text: 'AT03', x0: -2.02, yTop: 0.658, px: 0.020, zMin: 0.005, color: M.ACC1 },
    { kind: 'noseNumber', text: '10', xRear: 2.10, px: 0.026, color: M.WHT },
    { kind: 'epNumber', text: '10', x0: -2.50, yTop: 0.87, px: 0.034, color: M.ACC1, only: M.BODY },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'ALPHATAURI', yTop: 0.938, px: 0.014, color: M.ACC1, only: M.BODY },
  ],
};

const HAA = {
  id: 'haas',
  name: '哈斯 VF-22', short: 'VF-22', number: 20,
  fullName: 'Haas F1 Team VF-22',
  year: 2022, driverNote: '星条三色 · 美国力量',
  desc: '纯白车身配红蓝饰线，美国车队的实用主义答卷。',
  uiColor: '#e8ebf0', uiColor2: '#d61a2c', uiText: '#d61a2c',
  palette: {
    1: [232, 235, 240], 2: [214, 26, 44], 3: [24, 36, 74], 4: [238, 240, 246],
    5: [31, 32, 38], 6: [27, 26, 28], 7: [188, 30, 40], 8: [30, 32, 38],
    9: [70, 72, 80], 10: [15, 15, 19], 11: [128, 132, 142], 12: [255, 44, 44],
    13: [38, 39, 45], 14: [72, 58, 42], 15: [26, 30, 40], 16: [180, 24, 40],
    17: [33, 36, 48], 18: [96, 100, 110], 19: [214, 26, 44], 20: [16, 20, 30],
    21: [24, 36, 74],
  },
  shape: {
    sidepod: 'bathtub', podX0: -1.64, podW: 0.715, podTop: 0.57, podTopPow: 1.05,
    inletH: 0.115, podStripe: M.ACC1,
    spineW: 0.28, spineTop: 0.86, spinePow: 1.65,
    finX0: -2.22, finX1: -1.42, finTop: 0.66, finMat: M.BODY,
    fwEl: [
      [2.60, 2.955, 0.068, 0.030, M.CARB],
      [2.50, 2.830, 0.114, 0.062, M.CARB],
      [2.42, 2.730, 0.163, 0.092, M.BODY],
      [2.355, 2.645, 0.212, 0.115, M.BODY],
    ],
    fwTipMat: M.ACC1, epTop: M.ACC1, epMain: M.BODY, epRear: M.BODY,
    rwMat: M.BODY, floorEdge: M.ACC2, cockpitMat: M.BODY,
    nosePaint: x => (x > 2.52 ? M.ACC1 : x > 2.40 ? M.ACC2 : M.BODY),
  },
  decals: [
    { kind: 'sideText', text: 'HAAS', x0: -0.75, yTop: 0.39, px: 0.028, zMin: 0.46, color: M.ACC1 },
    { kind: 'sideText', text: 'HAAS', x0: -1.98, yTop: 0.652, px: 0.022, zMin: 0.005, color: M.ACC1 },
    { kind: 'noseNumber', text: '20', xRear: 2.10, px: 0.026, color: M.ACC2 },
    { kind: 'epNumber', text: '20', x0: -2.50, yTop: 0.87, px: 0.034, color: M.ACC1, only: M.BODY },
  ],
  flapDecals: [
    { kind: 'rearText', text: 'HAAS', yTop: 0.938, px: 0.020, color: M.ACC1, only: M.BODY },
  ],
};

export const TEAMS = {
  redbull: RB, ferrari: FER, mercedes: MER, mclaren: MCL,
  alpine: ALP, astonmartin: AMR, williams: WIL,
  alfaromeo: ALF, alphatauri: ATR, haas: HAA,
};
export const TEAM_ORDER = ['redbull', 'ferrari', 'mercedes', 'mclaren', 'alpine', 'astonmartin', 'williams', 'alfaromeo', 'alphatauri', 'haas'];
export const DEFAULT_TEAM = 'redbull';

export function loadSelectedTeam() {
  const t = localStorage.getItem('voxelf1-team');
  return TEAMS[t] ? t : DEFAULT_TEAM;
}
export function saveSelectedTeam(id) {
  if (TEAMS[id]) localStorage.setItem('voxelf1-team', id);
}
