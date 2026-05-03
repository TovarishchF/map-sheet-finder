const MAP_DEFAULT_CENTER = [55.751244, 37.618423];
const MAP_DEFAULT_ZOOM = 6;
const MAX_HISTORY = 50;
const MIN_LABEL_ZOOM = 4;
const MAP_MIN_ZOOM = 2;
const MAP_MAX_BOUNDS = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));

const SCALE_NAMES = {
    '1M': '1:1,000,000',
    '500k': '1:500,000',
    '300k': '1:300,000',
    '200k': '1:200,000',
    '100k': '1:100,000',
    '50k': '1:50,000',
    '25k': '1:25,000',
    '10k': '1:10,000',
    '5k': '1:5,000',
    '2k': '1:2,000'
};

const NEXT_SCALE_OPTIONS = {
    '1M':   ['500k', '300k', '200k', '100k'],
    '100k': ['50k', '5k'],
    '50k':  ['25k'],
    '25k':  ['10k'],
    '10k':  [],
    '5k':   ['2k'],
    '2k':   [],
    '500k': [],
    '300k': [],
    '200k': []
};

const DIVISIONS = {
    '500k': { rows: 2,  cols: 2,   labels: (i, j) => ['А', 'Б', 'В', 'Г'][i * 2 + j] },
    '300k': { rows: 3,  cols: 3,   labels: (i, j) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][i * 3 + j] },
    '200k': { rows: 6,  cols: 6,   labels: (i, j) => arabicToRoman(i * 6 + j + 1) },
    '100k': { rows: 12, cols: 12,  labels: (i, j) => (i * 12 + j + 1).toString() },
    '50k':  { rows: 2,  cols: 2,   labels: (i, j) => ['А', 'Б', 'В', 'Г'][i * 2 + j] },
    '25k':  { rows: 2,  cols: 2,   labels: (i, j) => ['а', 'б', 'в', 'г'][i * 2 + j] },
    '10k':  { rows: 2,  cols: 2,   labels: (i, j) => (i * 2 + j + 1).toString() },
    '5k':   { rows: 16, cols: 16,  labels: (i, j) => (i * 16 + j + 1).toString() },
    '2k':   { rows: 3,  cols: 3,   labels: (i, j) => ['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и'][i * 3 + j] }
};

const SCALE_EXPLANATIONS = {
    '1M': 'Масштаб 1:1 000 000. Размер листа 4°×6° (в средних широтах). Номенклатура задаётся буквой ряда и номером колонны.',
    '500k': 'Масштаб 1:500 000 (в 1 см 5 км). Делит миллионный лист на 4 части (2×2): А,Б,В,Г. Размер 2°×3°.',
    '300k': 'Масштаб 1:300 000 (в 1 см 3 км). Делит миллионный лист на 9 частей (3×3): I–IX. Размер 1°20′×2°.',
    '200k': 'Масштаб 1:200 000 (в 1 см 2 км). Делит миллионный лист на 36 частей (6×6): I–XXXVI. Размер 40′×1°. В высоких широтах листы сдваиваются.',
    '100k': 'Масштаб 1:100 000 (в 1 см 1 км). Делит миллионный лист на 144 части (12×12): 1–144. Размер 20′×30′.',
    '50k': 'Масштаб 1:50 000 (в 1 см 500 м). Делит 100-тысячный лист на 4 части (2×2): А,Б,В,Г. Размер 10′×15′.',
    '25k': 'Масштаб 1:25 000 (в 1 см 250 м). Делит 50-тысячный лист на 4 части (2×2): а,б,в,г. Размер 5′×7,5′.',
    '10k': 'Масштаб 1:10 000 (в 1 см 100 м). Делит 25-тысячный лист на 4 части: 1–4. Размер 2′30″×3′45″.',
    '5k': 'Масштаб 1:5 000 (в 1 см 50 м). Получается делением 100-тысячного листа на 256 частей (16×16), номера в скобках, например (1). Размер 1′15″×1′52.5″.',
    '2k': 'Масштаб 1:2 000 (в 1 см 20 м). Делит 5-тысячный лист на 9 частей (3×3): а–и. Номенклатура с дефисом в скобках, например (1-а). Размер 25″×37.5″.'
};

const ROMAN_VALUES = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9 };

const map = L.map('map', {
    minZoom: MAP_MIN_ZOOM,
    maxBounds: MAP_MAX_BOUNDS
}).setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM);

let gridLayer = L.layerGroup().addTo(map);
let markerLayer = L.layerGroup().addTo(map);
let boundaryLabelsLayer = L.layerGroup().addTo(map);
let currentSheetLayer = null;
let activeParent = null;
let historyStack = [];
let currentMode = 'reference';

const errorEl = document.getElementById('error-message');
const backBtn = document.getElementById('back-btn');
const focusSheetBtn = document.getElementById('focus-sheet-btn');
const scaleSelectorPanel = document.getElementById('next-scale-panel');
const scaleSelectorButtons = document.getElementById('next-scale-buttons');
const closeScaleSelectorBtn = document.getElementById('close-scale-panel');
const ambiguousModal = document.getElementById('ambiguous-scale-modal');
const modalOverlay = document.getElementById('modal-overlay');
const modalMessage = document.getElementById('modal-message');
const exportBtn = document.getElementById('export-geojson-btn');
const searchInput = document.getElementById('search-input');
const latInput = document.getElementById('lat-input');
const lngInput = document.getElementById('lng-input');
const currentNomenclatureEl = document.getElementById('current-nomenclature');
const currentScaleEl = document.getElementById('current-scale');
const boundNorthEl = document.getElementById('bound-north');
const boundSouthEl = document.getElementById('bound-south');
const boundWestEl = document.getElementById('bound-west');
const boundEastEl = document.getElementById('bound-east');
const modeToggleBtn = document.getElementById('mode-toggle-btn');
const trainerPanel = document.getElementById('trainer-panel');
const trainerTabs = document.querySelectorAll('.trainer-tab');
const trainerNomEl = document.getElementById('trainer-current-nomenclature');
const trainerScaleEl = document.getElementById('trainer-current-scale');
const trainerBoundN = document.getElementById('trainer-bound-north');
const trainerBoundS = document.getElementById('trainer-bound-south');
const trainerBoundW = document.getElementById('trainer-bound-west');
const trainerBoundE = document.getElementById('trainer-bound-east');
const trainerExplanation = document.getElementById('trainer-explanation');
const learningContentEl = document.getElementById('learning-content');
const cheatsheetBtn = document.getElementById('cheatsheet-btn');
const cheatsheetModal = document.getElementById('cheatsheet-modal');
const closeCheatsheetBtn = document.getElementById('close-cheatsheet');
const cheatsheetTableContainer = document.getElementById('cheatsheet-table-container');
const selectOption1 = document.getElementById('select-option1');
const selectOption2 = document.getElementById('select-option2');

let pendingNomenclature = null;
let pendingAmbiguityType = null;

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

function showError(text) {
    errorEl.textContent = text;
    errorEl.style.display = 'block';
}

function hideError() {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
}

function arabicToRoman(num) {
    if (num < 1 || num > 36) return '';
    const ones = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
    const tens = ['', 'X', 'XX', 'XXX'];
    return tens[Math.floor(num / 10)] + ones[num % 10];
}

function isSouthern(nomenclature) {
    return /\(ю\.п\.\)/i.test(nomenclature);
}

function cleanNomenclature(nom) {
    return nom.replace(/\s*\(Ю\.П\.\)\s*/i, '').trim();
}

function parseMillionPart(millionStr) {
    if (/^Z$/i.test(millionStr)) {
        return { row: 'Z', cols: [1], isSpecial: 'Z' };
    }
    const match = millionStr.match(/^([A-Va-v])-(\d+(?:,\d+)*)$/i);
    if (!match) throw new Error(`Неверный формат миллионного листа: ${millionStr}`);
    const rowLetter = match[1].toUpperCase();
    const colNumbers = match[2].split(',').map(n => parseInt(n.trim(), 10));
    if (rowLetter < 'A' || rowLetter > 'V') throw new Error(`Недопустимый ряд: ${rowLetter}`);
    for (let col of colNumbers) {
        if (col < 1 || col > 60) throw new Error(`Недопустимая колонна: ${col}`);
    }
    let type = 'single';
    if (colNumbers.length === 2) type = 'double';
    else if (colNumbers.length === 4) type = 'quadruple';
    return { row: rowLetter, cols: colNumbers, type };
}

function buildScaleSequence(extraParts, forcedScale = null) {
    const sequence = [];
    for (let i = 0; i < extraParts.length; i++) {
        let part = extraParts[i];
        const purePart = part.split(',')[0].trim();
        if (/^\d+$/.test(purePart) && parseInt(purePart) >= 1 && parseInt(purePart) <= 144) {
            if (i === 0 && extraParts.length === 1) {
                sequence.push('100k');
            } else {
                const prev = extraParts[i - 1];
                if (prev && /^[абвг]$/.test(prev)) {
                    sequence.push('10k');
                } else {
                    sequence.push('100k');
                }
            }
        } else if (/^[АБВГ]$/.test(purePart)) {
            sequence.push(i === 0 && extraParts.length === 1 ? '500k' : '50k');
        } else if (/^[абвг]$/.test(purePart)) {
            sequence.push('25k');
        } else if (/^[IVX]+$/i.test(purePart)) {
            sequence.push(forcedScale === '300k' ? '300k' : '200k');
        } else if (/^[IVXLCDM]+$/i.test(purePart)) {
            sequence.push('200k');
        }
    }
    return sequence;
}

function getScaleFromNomenclature(nom, forcedScale = null) {
    const cleaned = cleanNomenclature(nom);
    if (/^Z$/i.test(cleaned)) return '1M';
    const parts = cleaned.split('-');
    if (parts.length >= 2 && /^[IVX]+$/i.test(parts[0])) return '300k';
    let baseNom = cleaned;
    const bracketMatch = cleaned.match(/^(.+?)\(([^)]+)\)$/);
    if (bracketMatch) {
        baseNom = bracketMatch[1].trim();
        const bracketPart = bracketMatch[2].trim();
        return bracketPart.includes('-') ? '2k' : '5k';
    }
    const baseParts = baseNom.split('-');
    if (baseParts.length === 1) return '1M';
    const millionCandidate = baseParts[0] + '-' + baseParts[1];
    if (/^[A-Z]-\d+(,\d+)*$/.test(millionCandidate)) {
        if (baseParts.length === 2) return '1M';
        const scaleSeq = buildScaleSequence(baseParts.slice(2), forcedScale);
        return scaleSeq.length > 0 ? scaleSeq[scaleSeq.length - 1] : '1M';
    }
    return '1M';
}

function resolveCompositeLonBounds(latSouth, colNumbers, type) {
    const absLat = Math.abs(latSouth);
    if (type === 'double' && absLat >= 60 && absLat < 76) {
        if (colNumbers[0] % 2 === 0) throw new Error(`Сдвоенный лист должен начинаться с нечётной колонки`);
        return { west: -180 + (colNumbers[0] - 1) * 6, east: -180 + (colNumbers[0] - 1) * 6 + 12 };
    }
    if (type === 'quadruple' && absLat >= 76 && absLat < 88) {
        if ((colNumbers[0] - 1) % 4 !== 0) throw new Error(`Счетверённый лист должен начинаться с колонки вида 1,5,9...`);
        return { west: -180 + (colNumbers[0] - 1) * 6, east: -180 + (colNumbers[0] - 1) * 6 + 24 };
    }
    if (type === 'single') {
        const col = colNumbers[0];
        return { west: -180 + (col - 1) * 6, east: -180 + (col - 1) * 6 + 6 };
    }
    if (type === 'double') {
        if (colNumbers[1] !== colNumbers[0] + 1) throw new Error(`Неверные колонки для сдвоенного листа: ${colNumbers.join(',')}`);
        return { west: -180 + (colNumbers[0] - 1) * 6, east: -180 + (colNumbers[0] - 1) * 6 + 12 };
    }
    if (type === 'quadruple') {
        if (colNumbers[3] !== colNumbers[0] + 3) throw new Error(`Неверные колонки для счетверённого листа: ${colNumbers.join(',')}`);
        return { west: -180 + (colNumbers[0] - 1) * 6, east: -180 + (colNumbers[0] - 1) * 6 + 24 };
    }
    throw new Error('Неизвестный тип листа');
}

function subdivideBounds(currentBounds, scale, designation) {
    const div = DIVISIONS[scale];
    if (!div) return currentBounds;
    const parts = designation.includes(',') ? designation.split(',').map(s => s.trim()) : [designation];
    const primary = parts[0];
    const labels = [];
    for (let r = 0; r < div.rows; r++) {
        for (let c = 0; c < div.cols; c++) {
            labels.push(div.labels(r, c));
        }
    }
    const idx = labels.indexOf(primary);
    if (idx === -1) {
        console.warn(`Не найдена метка "${primary}" для масштаба ${scale}`);
        return currentBounds;
    }
    const row = Math.floor(idx / div.cols);
    const col = idx % div.cols;
    const latStep = (currentBounds.getNorth() - currentBounds.getSouth()) / div.rows;
    const lngStep = (currentBounds.getEast() - currentBounds.getWest()) / div.cols;
    const north = currentBounds.getNorth() - row * latStep;
    const south = north - latStep;
    let west = currentBounds.getWest() + col * lngStep;
    let east = west + lngStep * parts.length;
    return L.latLngBounds(L.latLng(south, west), L.latLng(north, east));
}

function nomenclatureToBounds(nomenclature, forcedScale = null) {
    let nom = nomenclature.trim();
    const southern = isSouthern(nom);
    nom = cleanNomenclature(nom);
    if (/^Z$/i.test(nom)) {
        if (southern) throw new Error('Лист Z не существует в южном полушарии');
        return L.latLngBounds(L.latLng(88, -180), L.latLng(90, 180));
    }
    let prefixRoman = null;
    const parts = nom.split('-');
    if (parts.length >= 2 && /^[IVX]+$/i.test(parts[0])) {
        prefixRoman = parts[0].toUpperCase();
        nom = parts.slice(1).join('-');
    }
    let baseNom = nom;
    let bracketPart = '';
    const bracketMatch = nom.match(/^(.+?)\(([^)]+)\)$/);
    if (bracketMatch) {
        baseNom = bracketMatch[1].trim();
        bracketPart = bracketMatch[2].trim();
    }
    const baseParts = baseNom.split('-');
    let millionPart;
    let extraParts = [];
    if (baseParts.length === 1) {
        millionPart = baseParts[0] + '-1';
    } else {
        millionPart = baseParts[0] + '-' + baseParts[1];
        extraParts = baseParts.slice(2);
    }
    const millionInfo = parseMillionPart(millionPart);
    const rowIndex = millionInfo.row.charCodeAt(0) - 'A'.charCodeAt(0);
    let latSouth, latNorth;
    if (southern) {
        latSouth = - (rowIndex + 1) * 4;
        latNorth = - rowIndex * 4;
    } else {
        latSouth = rowIndex * 4;
        latNorth = (rowIndex + 1) * 4;
    }
    const lonBounds = resolveCompositeLonBounds(latSouth, millionInfo.cols, millionInfo.type);
    let currentBounds = L.latLngBounds(L.latLng(latSouth, lonBounds.west), L.latLng(latNorth, lonBounds.east));
    if (prefixRoman) {
        currentBounds = subdivideBounds(currentBounds, '300k', prefixRoman);
    }
    const scaleSequence = buildScaleSequence(extraParts, forcedScale);
    for (let i = 0; i < scaleSequence.length; i++) {
        const scale = scaleSequence[i];
        const part = extraParts[i];
        currentBounds = subdivideBounds(currentBounds, scale, part);
    }
    if (bracketPart) {
        const bracketSubParts = bracketPart.split('-').map(s => s.trim());
        currentBounds = subdivideBounds(currentBounds, '5k', bracketSubParts[0]);
        if (bracketSubParts.length > 1) {
            currentBounds = subdivideBounds(currentBounds, '2k', bracketSubParts[1]);
        }
    }
    return currentBounds;
}

function isCompositeSheet(nomenclature, scale) {
    const cleaned = cleanNomenclature(nomenclature);
    if (scale === '1M') {
        const parts = cleaned.split('-');
        if (parts.length >= 2) {
            try {
                const info = parseMillionPart(parts[0] + '-' + parts[1]);
                return info.type === 'double' || info.type === 'quadruple';
            } catch (e) { return false; }
        }
        return false;
    }
    const lastPart = cleaned.split('-').pop();
    return lastPart ? lastPart.includes(',') : false;
}

function splitCompositeSheet(nomenclature, bounds, scale) {
    const cleaned = cleanNomenclature(nomenclature);
    const southern = isSouthern(nomenclature);
    let subParts;
    let count;
    if (scale === '1M') {
        const parts = cleaned.split('-');
        if (parts.length < 2) return [];
        const millionInfo = parseMillionPart(parts[0] + '-' + parts[1]);
        if (millionInfo.type === 'single') return [];
        subParts = millionInfo.cols;
        count = subParts.length;
    } else {
        const parts = cleaned.split('-');
        const lastPart = parts[parts.length - 1];
        if (!lastPart.includes(',')) return [];
        subParts = lastPart.split(',').map(p => p.trim());
        count = subParts.length;
    }
    const lonStep = (bounds.getEast() - bounds.getWest()) / count;
    const sheets = [];
    const baseParts = cleanNomenclature(nomenclature).split('-');
    for (let idx = 0; idx < count; idx++) {
        const west = bounds.getWest() + idx * lonStep;
        const east = west + lonStep;
        const sheetBounds = L.latLngBounds(L.latLng(bounds.getSouth(), west), L.latLng(bounds.getNorth(), east));
        let singleNom;
        if (scale === '1M') {
            singleNom = `${baseParts[0]}-${subParts[idx]}`;
        } else {
            const newParts = baseParts.slice();
            newParts[newParts.length - 1] = subParts[idx];
            singleNom = newParts.join('-');
        }
        if (southern && !singleNom.includes('(Ю.П.)')) singleNom += ' (Ю.П.)';
        sheets.push({ bounds: sheetBounds, nomenclature: singleNom });
    }
    return sheets;
}

function generateSheetsInside(parentBounds, parentNom, targetScale) {
    const sheets = [];
    const div = DIVISIONS[targetScale];
    if (!div) return sheets;
    const southern = isSouthern(parentNom);
    let cleanParent = cleanNomenclature(parentNom);
    const south = parentBounds.getSouth();
    const west = parentBounds.getWest();
    const north = parentBounds.getNorth();
    const east = parentBounds.getEast();
    const latStep = (north - south) / div.rows;
    const lngStep = (east - west) / div.cols;
    for (let i = 0; i < div.rows; i++) {
        const rowNorth = north - i * latStep;
        const rowSouth = rowNorth - latStep;
        for (let j = 0; j < div.cols; j++) {
            let sheetWest = west + j * lngStep;
            let sheetEast = sheetWest + lngStep;
            const centerLat = (rowNorth + rowSouth) / 2;
            const absLat = Math.abs(centerLat);
            let suffix;
            if ((targetScale === '500k' || targetScale === '200k' || targetScale === '100k') && absLat >= 60) {
                if (absLat >= 76) {
                    if (targetScale === '200k') {
                        if (j % 3 === 0) {
                            const labels = Array.from({length: 3}, (_, k) => div.labels(i, j + k));
                            suffix = labels.join(',');
                            sheetEast = west + (j + 3) * lngStep;
                            j += 2;
                        } else continue;
                    } else if (targetScale === '100k') {
                        if (j === 0) {
                            const labels = Array.from({length: 4}, (_, k) => div.labels(i, k));
                            suffix = labels.join(',');
                            sheetEast = east;
                            j = div.cols;
                        } else continue;
                    } else if (targetScale === '500k') {
                        if (j === 0) {
                            suffix = `${div.labels(i,0)},${div.labels(i,1)}`;
                            sheetEast = west + 2 * lngStep;
                            j = 1;
                        } else if (j === 2) {
                            suffix = `${div.labels(i,2)},${div.labels(i,3)}`;
                            sheetWest = west + 2 * lngStep;
                            sheetEast = east;
                            j = div.cols;
                        } else continue;
                    }
                } else if (absLat >= 60) {
                    if (targetScale === '500k') {
                        suffix = div.labels(i, j);
                    } else {
                        if (j % 2 === 0) {
                            suffix = `${div.labels(i, j)},${div.labels(i, j + 1)}`;
                            sheetEast = sheetWest + 2 * lngStep;
                            j++;
                        } else continue;
                    }
                }
            } else {
                suffix = div.labels(i, j);
            }
            const sheetBounds = L.latLngBounds(L.latLng(rowSouth, sheetWest), L.latLng(rowNorth, sheetEast));
            let nomenclature;
            if (targetScale === '5k') {
                nomenclature = `${cleanParent}(${suffix})`;
            } else if (targetScale === '2k') {
                const match = cleanParent.match(/^(.*)\((\d+)\)$/);
                if (match) {
                    nomenclature = `${match[1]}(${match[2]}-${suffix})`;
                } else {
                    nomenclature = `${cleanParent}(${suffix})`;
                }
            } else if (targetScale === '300k') {
                nomenclature = `${suffix}-${cleanParent}`;
            } else {
                nomenclature = `${cleanParent}-${suffix}`;
            }
            if (southern && !nomenclature.includes('(Ю.П.)')) nomenclature += ' (Ю.П.)';
            sheets.push({ bounds: sheetBounds, nomenclature });
        }
    }
    return sheets;
}

function updateGrid() {
    gridLayer.clearLayers();
    let sheets = [];
    if (!activeParent) {
        const viewBounds = map.getBounds();
        const south = Math.floor(viewBounds.getSouth() / 4) * 4;
        const north = viewBounds.getNorth();
        for (let lat = south; lat < north; lat += 4) {
            const absLat = Math.abs(lat);
            const southern = lat < 0;
            if (absLat >= 88) {
                if (!southern) {
                    sheets.push({ bounds: L.latLngBounds(L.latLng(88, -180), L.latLng(90, 180)), nomenclature: 'Z' });
                }
                continue;
            }
            let lngStep, type;
            if (absLat >= 76) { lngStep = 24; type = 'quadruple'; }
            else if (absLat >= 60) { lngStep = 12; type = 'double'; }
            else { lngStep = 6; type = 'single'; }
            let west = Math.floor((viewBounds.getWest() + 180) / lngStep) * lngStep - 180;
            west = Math.max(west, -180);
            const east = Math.min(viewBounds.getEast(), 180);
            for (let lng = west; lng < east; lng += lngStep) {
                if (lng < -180 || lng >= 180) continue;
                const sheetBounds = L.latLngBounds(L.latLng(lat, lng), L.latLng(lat + 4, lng + lngStep));
                const absRow = Math.floor(Math.abs(lat) / 4);
                const rowLetter = String.fromCharCode('A'.charCodeAt(0) + absRow);
                const suffix = southern ? ' (Ю.П.)' : '';
                const startCol = Math.floor((lng + 180) / 6) + 1;
                let nomenclature;
                if (type === 'single') {
                    nomenclature = `${rowLetter}-${startCol}${suffix}`;
                } else if (type === 'double') {
                    const firstCol = startCol % 2 === 0 ? startCol - 1 : startCol;
                    nomenclature = `${rowLetter}-${firstCol},${firstCol + 1}${suffix}`;
                } else if (type === 'quadruple') {
                    let firstCol = startCol;
                    while ((firstCol - 1) % 4 !== 0) firstCol--;
                    nomenclature = `${rowLetter}-${firstCol},${firstCol + 1},${firstCol + 2},${firstCol + 3}${suffix}`;
                }
                sheets.push({ bounds: sheetBounds, nomenclature });
            }
        }
        currentScaleEl.textContent = SCALE_NAMES['1M'];
    } else {
        if (isCompositeSheet(activeParent.nomenclature, activeParent.scale)) {
            sheets = splitCompositeSheet(activeParent.nomenclature, activeParent.bounds, activeParent.scale);
        } else if (activeParent.nextScale) {
            sheets = generateSheetsInside(activeParent.bounds, activeParent.nomenclature, activeParent.nextScale);
        }
    }
    const currentZoom = map.getZoom();
    sheets.forEach(sheet => {
        const geojson = {
            type: 'Feature',
            properties: { nomenclature: sheet.nomenclature },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [sheet.bounds.getWest(), sheet.bounds.getSouth()],
                    [sheet.bounds.getEast(), sheet.bounds.getSouth()],
                    [sheet.bounds.getEast(), sheet.bounds.getNorth()],
                    [sheet.bounds.getWest(), sheet.bounds.getNorth()],
                    [sheet.bounds.getWest(), sheet.bounds.getSouth()]
                ]]
            }
        };
        const layer = L.geoJSON(geojson, {
            style: { color: '#1976d2', weight: 1, fillOpacity: 0 },
            onEachFeature: (feature, l) => {
                l.on('click', () => displaySheet(sheet.nomenclature));
                l.on('mouseover', () => l.setStyle({ weight: 3, fillOpacity: 0.1, fillColor: '#3b82f6' }));
                l.on('mouseout', () => l.setStyle({ weight: 1, fillOpacity: 0, fillColor: '#3b82f6' }));
            }
        }).addTo(gridLayer);
        let labelText = sheet.nomenclature;
        if (activeParent) {
            if (activeParent.nextScale === '300k' || (activeParent.scale === '1M' && activeParent.nextScale === '300k')) {
                labelText = sheet.nomenclature.split('-')[0];
            } else {
                labelText = sheet.nomenclature.split('-').pop();
            }
        }
        if (sheet.nomenclature.includes('(')) {
            const match = sheet.nomenclature.match(/\(([^)]+)\)/);
            if (match) labelText = match[1];
        }
        if (currentZoom >= MIN_LABEL_ZOOM) {
            layer.bindTooltip(labelText, {
                permanent: true,
                direction: 'center',
                className: 'sheet-label'
            });
        }
    });
    updateBackButtonState();
    updateFocusButtonState();
}

function proceedToNextScale(parentScale) {
    if (activeParent && isCompositeSheet(activeParent.nomenclature, activeParent.scale)) {
        scaleSelectorPanel.style.display = 'none';
        return false;
    }
    const options = NEXT_SCALE_OPTIONS[parentScale] || [];
    if (options.length === 0) {
        scaleSelectorPanel.style.display = 'none';
        return false;
    }
    if (options.length === 1) {
        if (activeParent) {
            activeParent.nextScale = options[0];
            updateGrid();
        }
        scaleSelectorPanel.style.display = 'none';
        return true;
    }
    scaleSelectorButtons.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = SCALE_NAMES[opt] || opt;
        btn.addEventListener('click', () => {
            if (activeParent) {
                activeParent.nextScale = opt;
                updateGrid();
                scaleSelectorPanel.style.display = 'none';
            }
        });
        scaleSelectorButtons.appendChild(btn);
    });
    scaleSelectorPanel.style.display = 'block';
    return true;
}

function pushHistoryState(nomenclature, bounds, scale) {
    const last = historyStack[historyStack.length - 1];
    if (last && last.nomenclature === nomenclature && last.scale === scale) return;
    historyStack.push({ nomenclature, bounds, scale });
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    updateBackButtonState();
}

function goBack() {
    if (historyStack.length <= 1) return;
    historyStack.pop();
    const prev = historyStack[historyStack.length - 1];
    if (prev.nomenclature === null) {
        activeParent = null;
        if (currentSheetLayer) map.removeLayer(currentSheetLayer);
        currentSheetLayer = null;
        clearInfoPanel();
        clearBoundaryLabels();
        map.setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM);
        scaleSelectorPanel.style.display = 'none';
        exportBtn.disabled = true;
    } else {
        activeParent = { nomenclature: prev.nomenclature, bounds: prev.bounds, scale: prev.scale };
        if (currentSheetLayer) map.removeLayer(currentSheetLayer);
        if (activeParent.bounds) {
            highlightActiveSheet(activeParent.bounds, activeParent.nomenclature);
            updateGrid();
            map.fitBounds(activeParent.bounds, { padding: [50, 50] });
            currentScaleEl.textContent = SCALE_NAMES[prev.scale] || prev.scale;
            proceedToNextScale(activeParent.scale);
            exportBtn.disabled = false;
            updateBoundaryLabels(activeParent.bounds);
            updateTrainerPanelIfActive(activeParent.nomenclature, activeParent.scale, activeParent.bounds);
        }
    }
    updateBackButtonState();
    updateFocusButtonState();
}

function updateBackButtonState() {
    if (backBtn) backBtn.disabled = historyStack.length <= 1;
}

function updateFocusButtonState() {
    if (focusSheetBtn) focusSheetBtn.disabled = !activeParent;
}

function focusOnActiveSheet() {
    if (!activeParent || !activeParent.bounds) return;
    map.fitBounds(activeParent.bounds, { padding: [50, 50] });
}

function ddToDMS(value, isLat = true) {
    const dir = isLat ? (value >= 0 ? 'с.ш.' : 'ю.ш.') : (value >= 0 ? 'в.д.' : 'з.д.');
    const abs = Math.abs(value);
    let totalSec = Math.round(abs * 3600 * 10);
    const deg = Math.floor(totalSec / (3600 * 10));
    totalSec -= deg * 3600 * 10;
    const min = Math.floor(totalSec / (60 * 10));
    totalSec -= min * 60 * 10;
    const secInt = Math.floor(totalSec / 10);
    const secDec = totalSec % 10;
    const degStr = String(deg).padStart(2, '0');
    const minStr = String(min).padStart(2, '0');
    const secStr = String(secInt).padStart(2, '0') + ',' + secDec;
    return `${degStr}° ${minStr}′ ${secStr}″ ${dir}`;
}

function boundsToGeoJSON(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const nw = L.latLng(ne.lat, sw.lng);
    const se = L.latLng(sw.lat, ne.lng);
    return {
        type: "Feature",
        properties: {
            nomenclature: activeParent?.nomenclature || "",
            scale: currentScaleEl.textContent,
            area: (bounds.getNorth() - bounds.getSouth()) * (bounds.getEast() - bounds.getWest())
        },
        geometry: {
            type: "Polygon",
            coordinates: [[
                [sw.lng, sw.lat],
                [se.lng, se.lat],
                [ne.lng, ne.lat],
                [nw.lng, nw.lat],
                [sw.lng, sw.lat]
            ]]
        }
    };
}

function clearInfoPanel() {
    currentNomenclatureEl.textContent = '—';
    currentScaleEl.textContent = '—';
    boundNorthEl.textContent = '—';
    boundSouthEl.textContent = '—';
    boundWestEl.textContent = '—';
    boundEastEl.textContent = '—';
}

function highlightActiveSheet(bounds, nomenclature) {
    if (currentSheetLayer) map.removeLayer(currentSheetLayer);
    const geojson = {
        type: 'Feature',
        properties: { nomenclature },
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [bounds.getWest(), bounds.getSouth()],
                [bounds.getEast(), bounds.getSouth()],
                [bounds.getEast(), bounds.getNorth()],
                [bounds.getWest(), bounds.getNorth()],
                [bounds.getWest(), bounds.getSouth()]
            ]]
        }
    };
    currentSheetLayer = L.geoJSON(geojson, {
        style: { color: '#d32f2f', weight: 3, fillOpacity: 0.1 }
    }).addTo(map);
    currentNomenclatureEl.textContent = nomenclature;
    boundNorthEl.textContent = ddToDMS(bounds.getNorth(), true);
    boundSouthEl.textContent = ddToDMS(bounds.getSouth(), true);
    boundWestEl.textContent = ddToDMS(bounds.getWest(), false);
    boundEastEl.textContent = ddToDMS(bounds.getEast(), false);
}

function updateBoundaryLabels(bounds) {
    clearBoundaryLabels();
    if (!bounds) return;
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const centerLat = (north + south) / 2;
    const centerLng = (west + east) / 2;
    const latClass = 'boundary-label lat';
    const lngClass = 'boundary-label lng';
    L.marker([north, centerLng], { icon: L.divIcon({ className: latClass, html: ddToDMS(north, true), iconSize: [200, 20], iconAnchor: [100, 10] }) }).addTo(boundaryLabelsLayer);
    L.marker([south, centerLng], { icon: L.divIcon({ className: latClass, html: ddToDMS(south, true), iconSize: [200, 20], iconAnchor: [100, 10] }) }).addTo(boundaryLabelsLayer);
    L.marker([centerLat, west], { icon: L.divIcon({ className: lngClass, html: ddToDMS(west, false), iconSize: [200, 20], iconAnchor: [100, 10] }) }).addTo(boundaryLabelsLayer);
    L.marker([centerLat, east], { icon: L.divIcon({ className: lngClass, html: ddToDMS(east, false), iconSize: [200, 20], iconAnchor: [100, 10] }) }).addTo(boundaryLabelsLayer);
}

function clearBoundaryLabels() {
    boundaryLabelsLayer.clearLayers();
}

function finalizeDisplaySheet(nomenclature, bounds, scale) {
    if (activeParent) {
        pushHistoryState(activeParent.nomenclature, activeParent.bounds, activeParent.scale);
    } else {
        pushHistoryState(null, null, null);
    }
    activeParent = { nomenclature, bounds, scale };
    highlightActiveSheet(bounds, nomenclature);
    gridLayer.clearLayers();
    currentScaleEl.textContent = SCALE_NAMES[scale] || scale;
    proceedToNextScale(scale);
    if (currentMode === 'trainer') {
        trainerNomEl.textContent = nomenclature;
        trainerScaleEl.textContent = SCALE_NAMES[scale] || scale;
        trainerBoundN.textContent = ddToDMS(bounds.getNorth(), true);
        trainerBoundS.textContent = ddToDMS(bounds.getSouth(), true);
        trainerBoundW.textContent = ddToDMS(bounds.getWest(), false);
        trainerBoundE.textContent = ddToDMS(bounds.getEast(), false);
        trainerExplanation.textContent = generateExplanation(nomenclature, scale, bounds);
    }
    updateBoundaryLabels(bounds);
    if (isCompositeSheet(nomenclature, scale)) {
        scaleSelectorPanel.style.display = 'none';
    }
    exportBtn.disabled = false;
    updateFocusButtonState();
    map.fitBounds(bounds, { padding: [50, 50] });
}

function displaySheet(nomenclature) {
    try {
        hideError();
        const bounds = nomenclatureToBounds(nomenclature);
        const scale = getScaleFromNomenclature(nomenclature);
        finalizeDisplaySheet(nomenclature, bounds, scale);
    } catch (e) {
        showError(e.message);
        console.error(e);
    }
}

function goToCoordinates(lat, lng) {
    if (isNaN(lat) || isNaN(lng)) throw new Error('Координаты должны быть числами');
    if (lat < -90 || lat > 90) throw new Error('Широта от -90 до 90');
    if (lng < -180 || lng > 180) throw new Error('Долгота от -180 до 180');
    markerLayer.clearLayers();
    L.marker([lat, lng]).addTo(markerLayer).bindPopup(`${lat.toFixed(5)}°, ${lng.toFixed(5)}°`).openPopup();
    map.setView([lat, lng], 10);
    const southern = lat < 0;
    const absLat = Math.abs(lat);
    if (absLat >= 88) {
        if (!southern) {
            displaySheet('Z');
        } else {
            showError('Лист Z не существует в южном полушарии');
        }
        return;
    }
    const absRow = Math.floor(absLat / 4);
    const rowLetter = String.fromCharCode('A'.charCodeAt(0) + absRow);
    const suffix = southern ? ' (Ю.П.)' : '';
    let lngStep;
    if (absLat >= 76) lngStep = 24;
    else if (absLat >= 60) lngStep = 12;
    else lngStep = 6;
    let lngNormalized = lng;
    while (lngNormalized < -180) lngNormalized += 360;
    while (lngNormalized >= 180) lngNormalized -= 360;
    let startCol = Math.floor((lngNormalized + 180) / 6) + 1;
    let nomenclature;
    if (lngStep === 6) {
        nomenclature = `${rowLetter}-${startCol}${suffix}`;
    } else if (lngStep === 12) {
        const firstCol = startCol % 2 === 0 ? startCol - 1 : startCol;
        nomenclature = `${rowLetter}-${firstCol},${firstCol + 1}${suffix}`;
    } else if (lngStep === 24) {
        let firstCol = startCol;
        while ((firstCol - 1) % 4 !== 0) firstCol--;
        nomenclature = `${rowLetter}-${firstCol},${firstCol + 1},${firstCol + 2},${firstCol + 3}${suffix}`;
    }
    displaySheet(nomenclature);
}

function generateExplanation(nomenclature, scale, bounds) {
    let text = SCALE_EXPLANATIONS[scale] || '';
    if (isCompositeSheet(nomenclature, scale)) {
        text += ' Лист является сдвоенным или счетверённым из-за высоких широт (долготный размер уменьшен).';
    }
    if (isSouthern(nomenclature)) {
        text += ' Лист находится в Южном полушарии (Ю.П.).';
    }
    return text;
}

function updateTrainerPanelIfActive(nomenclature, scale, bounds) {
    if (currentMode === 'trainer') {
        trainerNomEl.textContent = nomenclature;
        trainerScaleEl.textContent = SCALE_NAMES[scale] || scale;
        trainerBoundN.textContent = ddToDMS(bounds.getNorth(), true);
        trainerBoundS.textContent = ddToDMS(bounds.getSouth(), true);
        trainerBoundW.textContent = ddToDMS(bounds.getWest(), false);
        trainerBoundE.textContent = ddToDMS(bounds.getEast(), false);
        trainerExplanation.textContent = generateExplanation(nomenclature, scale, bounds);
    }
}

function switchMode(mode) {
    currentMode = mode;
    clearBoundaryLabels();
    if (mode === 'reference') {
        document.querySelector('.sidebar').style.display = '';
        trainerPanel.style.display = 'none';
        modeToggleBtn.textContent = 'Режим: Тренажёр';
        document.querySelector('.search-section').style.display = '';
        scaleSelectorPanel.style.display = 'none';
        updateGrid();
    } else {
        document.querySelector('.sidebar').style.display = 'none';
        trainerPanel.style.display = 'flex';
        modeToggleBtn.textContent = 'Режим: Справочник';
        document.querySelector('.search-section').style.display = 'none';
        resetToInitialState();
        activateTrainerTab('learn');
        renderLearningContent();
    }
}

function resetToInitialState() {
    if (currentSheetLayer) {
        map.removeLayer(currentSheetLayer);
        currentSheetLayer = null;
    }
    activeParent = null;
    historyStack = [{ nomenclature: null, bounds: null, scale: null }];
    clearInfoPanel();
    exportBtn.disabled = true;
    scaleSelectorPanel.style.display = 'none';
    updateGrid();
    updateBackButtonState();
    updateFocusButtonState();
}

function activateTrainerTab(tabName) {
    trainerTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.trainer-content > div').forEach(div => div.style.display = 'none');
    if (tabName === 'learn') {
        learningContentEl.style.display = 'block';
    }
}

function renderLearningContent() {
    learningContentEl.innerHTML = `
        <div class="learning-section"><h4>Основы разграфки</h4><p>Земная поверхность делится на листы трапециевидной формы. Номенклатура — уникальное буквенно-цифровое обозначение, однозначно определяющее масштаб и положение листа.</p></div>
        <div class="learning-section"><h4>1:1 000 000</h4><p>Ряды по 4° широты (A–V), ряд Z у полюса. Колонны по 6° долготы (1–60) от 180° меридиана.</p><p>Пример: N-37 (Москва), размер 4°×6°.</p></div>
        <div class="learning-section"><h4>1:500 000</h4><p>Делит миллионный лист на 4 (2×2). Буквы А–Г, размер 2°×3°.</p></div>
        <div class="learning-section"><h4>1:300 000</h4><p>Делит миллионный на 9 (3×3). Римские цифры I–IX перед дефисом, размер 1°20′×2°.</p></div>
        <div class="learning-section"><h4>1:200 000</h4><p>Делит миллионный на 36 (6×6). Римские цифры I–XXXVI, размер 40′×1°.</p></div>
        <div class="learning-section"><h4>1:100 000</h4><p>Делит миллионный на 144 (12×12). Номера 1–144, размер 20′×30′.</p></div>
        <div class="learning-section"><h4>1:50 000</h4><p>Делит 100‑тысячный на 4. Буквы А–Г, размер 10′×15′.</p></div>
        <div class="learning-section"><h4>1:25 000</h4><p>Делит 50‑тысячный на 4. Строчные а–г, размер 5′×7,5′.</p></div>
        <div class="learning-section"><h4>1:10 000</h4><p>Делит 25‑тысячный на 4 (1–4), размер 2,5′×3,75′.</p></div>
        <div class="learning-section"><h4>1:5 000</h4><p>Делит 100‑тысячный на 256 (16×16), номер в скобках, размер 1′15″×1′52,5″.</p></div>
        <div class="learning-section"><h4>1:2 000</h4><p>Делит 5‑тысячный на 9 (3×3). Буквы а–и в скобках после номера 5‑тысячного, размер 25″×37,5″.</p></div>
        <div class="learning-section"><h4>Сдвоенные и счетверённые листы</h4><p>На широтах 60°–76° миллионные листы удваиваются по долготе (12°). 200‑тысячные также объединяются попарно. Свыше 76° – счетверённые миллионные листы (24°). Номенклатура содержит перечисление колонок или номеров через запятую.</p></div>
        <div class="learning-section"><h4>Южное полушарие</h4><p>Добавляется пометка (Ю.П.), например L-34 (Ю.П.).</p></div>
        <div class="learning-section"><h4>Как читать номенклатуру</h4><p>Номенклатура читается слева направо, каждый дефис добавляет уточнение масштаба. Пример: <b>N-37-56-А-а-1</b></p><ul><li><b>N-37</b> — миллионный лист (ряд N, колонна 37) масштаб 1:1 000 000.</li><li><b>56</b> — лист 1:100 000 (деление 12×12).</li><li><b>А</b> — лист 1:50 000 (деление 2×2).</li><li><b>а</b> — лист 1:25 000 (строчная буква).</li><li><b>1</b> — лист 1:10 000 (цифра).</li></ul><p>Дальнейшие деления дают 1:5 000 (номер в скобках) и 1:2 000 (номер-буква в скобках).</p></div>
    `;
}

function renderCheatsheet() {
    cheatsheetTableContainer.innerHTML = `
        <table>
            <tr><th>Масштаб</th><th>Делений</th><th>Обозначение</th><th>Размер (Ш×Д)</th><th>Пример</th></tr>
            <tr><td>1:1 000 000</td><td>—</td><td>Ряд-Колонна</td><td>4°×6°</td><td>N-37</td></tr>
            <tr><td>1:500 000</td><td>4</td><td>А–Г</td><td>2°×3°</td><td>N-37-А</td></tr>
            <tr><td>1:300 000</td><td>9</td><td>I–IX</td><td>1°20′×2°</td><td>III-N-37</td></tr>
            <tr><td>1:200 000</td><td>36</td><td>I–XXXVI</td><td>40′×1°</td><td>N-37-VI</td></tr>
            <tr><td>1:100 000</td><td>144</td><td>1–144</td><td>20′×30′</td><td>N-37-56</td></tr>
            <tr><td>1:50 000</td><td>4</td><td>А–Г</td><td>10′×15′</td><td>N-37-56-А</td></tr>
            <tr><td>1:25 000</td><td>4</td><td>а–г</td><td>5′×7,5′</td><td>N-37-56-А-а</td></tr>
            <tr><td>1:10 000</td><td>4</td><td>1–4</td><td>2,5′×3,75′</td><td>N-37-56-А-а-1</td></tr>
            <tr><td>1:5 000</td><td>256</td><td>(номер)</td><td>1′15″×1′52,5″</td><td>N-37-56(125)</td></tr>
            <tr><td>1:2 000</td><td>9</td><td>(номер-буква)</td><td>25″×37,5″</td><td>N-37-56(125-а)</td></tr>
        </table>
    `;
}

map.on('moveend', updateGrid);

document.getElementById('search-btn').addEventListener('click', () => {
    const val = searchInput.value.trim();
    val ? displaySheet(val) : showError('Введите номенклатуру');
});

document.getElementById('go-coords-btn').addEventListener('click', () => {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    try { goToCoordinates(lat, lng); hideError(); } catch (e) { showError(e.message); }
});

if (backBtn) backBtn.addEventListener('click', goBack);
if (focusSheetBtn) focusSheetBtn.addEventListener('click', focusOnActiveSheet);
if (closeScaleSelectorBtn) closeScaleSelectorBtn.addEventListener('click', () => { scaleSelectorPanel.style.display = 'none'; });

exportBtn.addEventListener('click', () => {
    if (!activeParent || !activeParent.bounds) return;
    const feature = boundsToGeoJSON(activeParent.bounds);
    const geojson = { type: "FeatureCollection", features: [feature] };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeParent.nomenclature.replace(/[^a-zA-Z0-9а-яА-Я-]/g, '_')}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

window.addEventListener('load', () => {
    historyStack = [{ nomenclature: null, bounds: null, scale: null }];
    updateGrid();
    hideError();
    updateBackButtonState();
    updateFocusButtonState();
    scaleSelectorPanel.style.display = 'none';
    exportBtn.disabled = true;
});

modeToggleBtn.addEventListener('click', () => {
    switchMode(currentMode === 'reference' ? 'trainer' : 'reference');
});

trainerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        if (tab.classList.contains('disabled')) return;
        activateTrainerTab(tab.dataset.tab);
        if (tab.dataset.tab === 'learn') renderLearningContent();
    });
});

cheatsheetBtn.addEventListener('click', () => {
    renderCheatsheet();
    cheatsheetModal.style.display = 'block';
    modalOverlay.style.display = 'block';
});

closeCheatsheetBtn.addEventListener('click', () => {
    cheatsheetModal.style.display = 'none';
    modalOverlay.style.display = 'none';
});

modalOverlay.addEventListener('click', () => {
    cheatsheetModal.style.display = 'none';
    ambiguousModal.style.display = 'none';
    modalOverlay.style.display = 'none';
});

selectOption1.addEventListener('click', () => {
    ambiguousModal.style.display = 'none';
    modalOverlay.style.display = 'none';
    const bounds = nomenclatureToBounds(pendingNomenclature, '300k');
    const scale = getScaleFromNomenclature(pendingNomenclature, '300k');
    finalizeDisplaySheet(pendingNomenclature, bounds, scale);
});

selectOption2.addEventListener('click', () => {
    ambiguousModal.style.display = 'none';
    modalOverlay.style.display = 'none';
    const bounds = nomenclatureToBounds(pendingNomenclature, '200k');
    const scale = getScaleFromNomenclature(pendingNomenclature, '200k');
    finalizeDisplaySheet(pendingNomenclature, bounds, scale);
});