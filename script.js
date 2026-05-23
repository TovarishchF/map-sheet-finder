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
let neighborLayers = L.layerGroup().addTo(map);
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
const trainerQuestionArea = document.getElementById('trainer-question-area');
const trainerCategorySelection = document.getElementById('trainer-category-selection');
const trainerQuestionText = document.getElementById('trainer-question-text');
const trainerDiagramContainer = document.getElementById('trainer-diagram-container');
const trainerAnswerInput = document.getElementById('trainer-answer-input');
const trainerOptionsContainer = document.getElementById('trainer-options-container');
const trainerCheckBtn = document.getElementById('trainer-check-btn');
const trainerFeedback = document.getElementById('trainer-feedback');
const trainerNextBtn = document.getElementById('trainer-next-btn');
const trainerBackToCategoriesBtn = document.getElementById('trainer-back-to-categories-btn');
const trainerScoreDisplay = document.getElementById('trainer-score-display');

let trainerPracticeState = {
    topic: null,
    questionCount: 0,
    correctCount: 0,
    currentQuestion: null,
    answered: false
};
let currentNeighborQuestion = null;

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

function checkAmbiguity(nomenclature) {
    const cleaned = cleanNomenclature(nomenclature);
    const parts = cleaned.split('-');
    if (parts.length < 2) return null;
    if (parts.length >= 2 && /^[IVX]+$/i.test(parts[0]) && /^[A-Z]-\d+/.test(parts.slice(1).join('-'))) {
        return 'roman-prefix';
    }
    if (parts.length === 3) {
        const lastPart = parts[2];
        if (/^[IVX]+$/i.test(lastPart) && ROMAN_VALUES.hasOwnProperty(lastPart.toUpperCase())) {
            return 'roman';
        }
    }
    return null;
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

function getNomenclatureAtPoint(lat, lng, targetScale) {
    const southern = lat < 0;
    const absLat = Math.abs(lat);
    const rowLetter = String.fromCharCode('A'.charCodeAt(0) + Math.floor(absLat / 4));
    const suffix = southern ? ' (Ю.П.)' : '';
    let lngNorm = lng;
    while (lngNorm < -180) lngNorm += 360;
    while (lngNorm >= 180) lngNorm -= 360;
    let col = Math.floor((lngNorm + 180) / 6) + 1;
    let nom = `${rowLetter}-${col}${suffix}`;

    if (targetScale === '1M') return nom;

    const millionBounds = nomenclatureToBounds(nom);
    const sheets = generateSheetsInside(millionBounds, nom, targetScale);
    for (const sheet of sheets) {
        if (sheet.bounds.contains(L.latLng(lat, lng))) {
            return sheet.nomenclature;
        }
    }
    return nom;
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

function densifyBounds(bounds, pointsPerSide = 10) {
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const latStep = (north - south) / pointsPerSide;
    const lngStep = (east - west) / pointsPerSide;
    const coords = [];
    for (let lng = west; lng <= east + lngStep * 0.1; lng += lngStep)
        coords.push([Math.min(lng, east), south]);
    for (let lat = south + latStep; lat <= north + latStep * 0.1; lat += latStep)
        coords.push([east, Math.min(lat, north)]);
    for (let lng = east - lngStep; lng >= west - lngStep * 0.1; lng -= lngStep)
        coords.push([Math.max(lng, west), north]);
    for (let lat = north - latStep; lat >= south - latStep * 0.1; lat -= latStep)
        coords.push([west, Math.max(lat, south)]);
    coords.push([west, south]);
    return coords;
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
                coordinates: [densifyBounds(sheet.bounds, 8)]
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
    historyStack.push({ nomenclature, bounds, scale });
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    updateBackButtonState();
}

function goBack() {
    if (historyStack.length === 0) return;
    const prev = historyStack.pop();
    if (prev.nomenclature === null) {
        activeParent = null;
        if (currentSheetLayer) map.removeLayer(currentSheetLayer);
        currentSheetLayer = null;
        clearInfoPanel();
        clearBoundaryLabels();
        map.setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM);
        scaleSelectorPanel.style.display = 'none';
        exportBtn.disabled = true;
        updateGrid();
    } else {
        activeParent = { nomenclature: prev.nomenclature, bounds: prev.bounds, scale: prev.scale };
        delete activeParent.nextScale;
        if (currentSheetLayer) map.removeLayer(currentSheetLayer);
        highlightActiveSheet(activeParent.bounds, activeParent.nomenclature);
        updateGrid();
        map.fitBounds(activeParent.bounds, { padding: [50, 50] });
        currentScaleEl.textContent = SCALE_NAMES[prev.scale] || prev.scale;
        proceedToNextScale(activeParent.scale);
        exportBtn.disabled = false;
        updateBoundaryLabels(activeParent.bounds);
        updateTrainerPanelIfActive(activeParent.nomenclature, activeParent.scale, activeParent.bounds);
    }
    updateBackButtonState();
    updateFocusButtonState();
}

function updateBackButtonState() {
    if (backBtn) backBtn.disabled = historyStack.length === 0;
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
    return {
        type: "Feature",
        properties: {
            nomenclature: activeParent?.nomenclature || "",
            scale: currentScaleEl.textContent,
            area: (bounds.getNorth() - bounds.getSouth()) * (bounds.getEast() - bounds.getWest())
        },
        geometry: {
            type: "Polygon",
            coordinates: [densifyBounds(bounds, 20)]
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
            coordinates: [densifyBounds(bounds, 12)]
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
        delete activeParent.nextScale;
    }
    pushHistoryState(
        activeParent ? activeParent.nomenclature : null,
        activeParent ? activeParent.bounds : null,
        activeParent ? activeParent.scale : null
    );
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
        const ambType = checkAmbiguity(nomenclature);
        if (ambType === 'roman') {
            pendingNomenclature = nomenclature;
            pendingAmbiguityType = ambType;
            modalMessage.textContent = 'Римская цифра может относиться к масштабу 1:300 000 или 1:200 000. Выберите нужный масштаб:';
            selectOption1.textContent = '1:300 000';
            selectOption2.textContent = '1:200 000';
            ambiguousModal.style.display = 'block';
            modalOverlay.style.display = 'block';
            return;
        }
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
        if (!map.hasLayer(gridLayer)) gridLayer.addTo(map);
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
    historyStack = [];
    clearInfoPanel();
    exportBtn.disabled = true;
    scaleSelectorPanel.style.display = 'none';
    if (map.hasLayer(gridLayer)) gridLayer.remove();
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
    } else if (tabName === 'practice') {
        startPractice();
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

function generateNomToScaleQuestion() {
    const bank = ['N-37', 'N-37-А', 'III-N-37', 'N-37-VI', 'N-37-56', 'N-37-56-А', 'N-37-56-А-а', 'N-37-56-А-а-1', 'N-37-56(125)', 'N-37-56(125-а)'];
    const nom = bank[Math.floor(Math.random() * bank.length)];
    const scale = getScaleFromNomenclature(nom);
    const correct = SCALE_NAMES[scale];
    const allScales = Object.values(SCALE_NAMES).filter(s => s !== correct).slice(0, 3);
    const options = shuffle([correct, ...allScales]);
    return { prompt: `Определите масштаб листа: ${nom}`, correctAnswer: correct, options, type: 'options' };
}

function generateBoundsToScaleQuestion() {
    const bank = ['N-37', 'N-37-А', 'N-37-56', 'N-37-56-А-а'];
    const nom = bank[Math.floor(Math.random() * bank.length)];
    const bounds = nomenclatureToBounds(nom);
    const correct = SCALE_NAMES[getScaleFromNomenclature(nom)];
    const allScales = Object.values(SCALE_NAMES).filter(s => s !== correct).slice(0, 3);
    const options = shuffle([correct, ...allScales]);
    return {
        prompt: `Границы листа: С ${ddToDMS(bounds.getNorth(), true)}, Ю ${ddToDMS(bounds.getSouth(), true)}, З ${ddToDMS(bounds.getWest(), false)}, В ${ddToDMS(bounds.getEast(), false)}. Какой масштаб?`,
        correctAnswer: correct,
        options,
        type: 'options',
        bounds: bounds
    };
}

function generateNeighborQuestion() {
    const candidateParents = ['N-37', 'M-42', 'K-52', 'O-40', 'P-45', 'R-50'];
    const parentNom = candidateParents[Math.floor(Math.random() * candidateParents.length)];
    const scale = '100k';
    const containerBounds = nomenclatureToBounds(parentNom);
    const allSheets = generateSheetsInside(containerBounds, parentNom, scale);
    if (allSheets.length < 9) return generateNeighborQuestion();

    let baseNom, baseBounds, neighborData;
    let attempts = 0;
    const maxAttempts = 50;
    do {
        const idx = Math.floor(Math.random() * allSheets.length);
        const baseSheet = allSheets[idx];
        baseNom = baseSheet.nomenclature;
        baseBounds = baseSheet.bounds;
        const centerLat = baseBounds.getSouth() + (baseBounds.getNorth() - baseBounds.getSouth()) / 2;
        const centerLng = baseBounds.getWest() + (baseBounds.getEast() - baseBounds.getWest()) / 2;
        const latStep = baseBounds.getNorth() - baseBounds.getSouth();
        const lngStep = baseBounds.getEast() - baseBounds.getWest();

        neighborData = {};
        const offsets = {
            north: [latStep * 1.1, 0],
            south: [-latStep * 1.1, 0],
            west: [0, -lngStep * 1.1],
            east: [0, lngStep * 1.1]
        };

        for (const dir of Object.keys(offsets)) {
            const [dLat, dLng] = offsets[dir];
            const pointLat = centerLat + dLat;
            const pointLng = centerLng + dLng;
            if (pointLat > 85 || pointLat < -85) continue;
            try {
                const neighborNom = getNomenclatureAtPoint(pointLat, pointLng, scale);
                if (neighborNom !== baseNom) {
                    const neighborBounds = nomenclatureToBounds(neighborNom);
                    neighborData[dir] = {
                        nomenclature: neighborNom,
                        bounds: neighborBounds
                    };
                }
            } catch (e) {}
        }
        attempts++;
    } while (Object.keys(neighborData).length < 4 && attempts < maxAttempts);

    return {
        prompt: `Найдите соседей листа <b>${baseNom}</b>. Впишите номенклатуру каждого соседа.`,
        baseNom,
        baseBounds,
        neighbors: neighborData,
        type: 'neighbor-input'
    };
}

function generateErrorQuestion() {
    const items = [
        { nom: 'N-37', valid: true },
        { nom: 'N-37-А', valid: true },
        { nom: 'III-N-37', valid: true },
        { nom: 'N-37-VI', valid: true },
        { nom: 'N-37-56', valid: true },
        { nom: 'N-37-56-А', valid: true },
        { nom: 'N-37-56-А-а', valid: true },
        { nom: 'N-37-56-А-а-1', valid: true },
        { nom: 'N-37-56(125)', valid: true },
        { nom: 'N-37-56(125-а)', valid: true },
        { nom: 'M-42-144', valid: true },
        { nom: 'K-52-30-Б', valid: true },
        { nom: 'O-40-37-Б-а', valid: true },
        { nom: 'Z', valid: true },
        { nom: 'A-1', valid: true },
        { nom: 'V-60', valid: true },
        { nom: 'N-37-A', valid: false, correction: 'N-37-А', explanation: 'Латинская A вместо кириллической А' },
        { nom: 'N-37-56-а', valid: false, correction: 'N-37-56-А', explanation: 'Лист 1:50 000 обозначается заглавной кириллической буквой (А–Г), а не строчной' },
        { nom: 'N-37-145', valid: false, correction: 'N-37-144', explanation: 'Номер листа 1:100 000 не может превышать 144 (12×12)' },
        { nom: 'N-37-0', valid: false, correction: 'N-37-1', explanation: 'Нумерация листов 1:100 000 начинается с 1' },
        { nom: 'A-01', valid: false, correction: 'A-1', explanation: 'Номер колонны не должен содержать ведущих нулей' },
        { nom: 'N-37/56', valid: false, correction: 'N-37-56', explanation: 'Разделителем частей номенклатуры служит дефис, а не косая черта' },
        { nom: 'N-37-56-A', valid: false, correction: 'N-37-56-А', explanation: 'Латинская A вместо кириллической А в обозначении 1:50 000' },
        { nom: 'N-37-56-А-В', valid: false, correction: 'N-37-56-А-в', explanation: 'Лист 1:25 000 обозначается строчной буквой (а–г), а не заглавной' },
        { nom: 'N-37-56(125-А)', valid: false, correction: 'N-37-56(125-а)', explanation: 'Лист 1:2 000 обозначается строчной кириллической буквой (а–и)' },
        { nom: 'III N-37', valid: false, correction: 'III-N-37', explanation: 'Римская цифра для 1:300 000 отделяется от миллионного листа дефисом без пробела' },
        { nom: 'N-37-56-А-а-5', valid: false, correction: 'N-37-56-А-а-4', explanation: 'Лист 1:10 000 делит 25-тысячный лист только на 4 части (нумерация 1–4)' },
        { nom: 'N-37-56-А-а-0', valid: false, correction: 'N-37-56-А-а-1', explanation: 'Нумерация листов 1:10 000 начинается с 1' },
        { nom: 'R-5-12-A', valid: false, correction: 'R-5-12-А', explanation: 'Латинская A вместо кириллической А' },
        { nom: 'L-34-56-Г-Б', valid: false, correction: 'L-34-56-Г-б', explanation: 'Лист 1:25 000 обозначается строчной буквой (а–г)' },
        { nom: 'O-40-37-Б-А', valid: false, correction: 'O-40-37-Б-а', explanation: 'Лист 1:25 000 обозначается строчной буквой' },
        { nom: 'M-42-12-г', valid: false, correction: 'M-42-12-Г', explanation: 'Лист 1:50 000 обозначается заглавной буквой (А–Г)' }
    ];
    const item = items[Math.floor(Math.random() * items.length)];
    const correctAnswer = item.valid ? 'Да' : 'Нет';
    return {
        prompt: `Правильна ли номенклатура «${item.nom}»?`,
        correctAnswer: correctAnswer,
        options: ['Да', 'Нет'],
        type: 'options',
        correction: item.valid ? null : item.correction,
        explanation: item.valid ? null : item.explanation
    };
}

function generateNextQuestion() {
    if (!trainerPracticeState.topic) return;
    let question;
    switch (trainerPracticeState.topic) {
        case 'nom-to-scale': question = generateNomToScaleQuestion(); break;
        case 'bounds-to-scale': question = generateBoundsToScaleQuestion(); break;
        case 'neighbor': question = generateNeighborQuestion(); break;
        case 'error': question = generateErrorQuestion(); break;
        case 'theory': question = generateTheoryQuestion(); break;
        default: return;
    }
    trainerPracticeState.currentQuestion = question;
    trainerPracticeState.answered = false;
    trainerQuestionText.innerHTML = question.prompt;
    if (trainerDiagramContainer) {
        if (question.bounds) {
            renderBoundsDiagram(question);
        } else {
            trainerDiagramContainer.style.display = 'none';
        }
    }
    trainerFeedback.textContent = '';
    trainerNextBtn.style.display = 'none';
    neighborLayers.clearLayers();
    if (currentSheetLayer) map.removeLayer(currentSheetLayer);

    if (question.type === 'neighbor-input') {
        currentNeighborQuestion = question;
        trainerAnswerInput.style.display = 'none';
        trainerOptionsContainer.style.display = 'block';
        renderNeighborInputs(question);
        highlightActiveSheet(question.baseBounds, question.baseNom);
        showNeighborsOnMapNoLabels(question);
        map.fitBounds(question.baseBounds.pad(1.5));
    } else if (question.type === 'options') {
        trainerAnswerInput.style.display = 'none';
        trainerOptionsContainer.style.display = 'block';
        renderOptions(question.options);
    } else {
        trainerAnswerInput.style.display = 'block';
        trainerOptionsContainer.style.display = 'none';
        trainerAnswerInput.value = '';
    }
    if (question.type === 'neighbor-input') {
        trainerCheckBtn.style.display = 'block';
    } else {
        trainerCheckBtn.style.display = 'none';
    }
}

function generateTheoryQuestion() {
    const pool = [
        {
            prompt: 'Какой размер листа масштаба 1:1 000 000 в средних широтах?',
            correct: '4°×6°',
            options: ['4°×6°', '2°×3°', '1°×1.5°', '6°×4°']
        },
        {
            prompt: 'Сколько листов масштаба 1:100 000 в одном миллионном листе?',
            correct: '144',
            options: ['144', '36', '256', '64']
        },
        {
            prompt: 'Какими буквами обозначаются листы 1:500 000?',
            correct: 'А,Б,В,Г',
            options: ['А,Б,В,Г', 'а,б,в,г', 'I,II,III,IV', '1,2,3,4']
        },
        {
            prompt: 'Что означает пометка (Ю.П.) в номенклатуре?',
            correct: 'Южное полушарие',
            options: ['Южное полушарие', 'Южная параллель', 'Юстированная поправка', 'Южный полюс']
        },
        {
            prompt: 'Как записывается номенклатура листа 1:300 000?',
            correct: 'Римская цифра перед миллионным листом',
            options: ['Римская цифра перед миллионным листом', 'Римская цифра после миллионного листа', 'Арабская цифра в скобках', 'Строчная буква после дефиса']
        },
        {
            prompt: 'Сколько листов масштаба 1:500 000 в одном миллионном?',
            correct: '4',
            options: ['4', '9', '36', '144']
        },
        {
            prompt: 'В каком масштабе листы обозначаются римскими цифрами от I до IX?',
            correct: '1:300 000',
            options: ['1:300 000', '1:200 000', '1:500 000', '1:100 000']
        },
        {
            prompt: 'Какая буква используется для самого северного ряда миллионной разграфки (кроме Z)?',
            correct: 'V',
            options: ['V', 'U', 'T', 'W']
        },
        {
            prompt: 'Какой масштаб следует за 1:10 000 при дальнейшем делении?',
            correct: '1:5 000',
            options: ['1:5 000', '1:2 000', '1:1 000', 'Нет деления']
        },
        {
            prompt: 'Лист масштаба 1:200 000 на широте 62° сдваивается. Как изменится его номенклатура?',
            correct: 'Номера двух смежных листов перечисляются через запятую',
            options: [
                'Номера двух смежных листов перечисляются через запятую',
                'Добавляется буква "С"',
                'Удваивается только размер, номенклатура не меняется',
                'Используется только один номер'
            ]
        },
        {
            prompt: 'Как образуется номенклатура листа 1:5 000?',
            correct: 'К номенклатуре 1:100 000 добавляется номер в скобках',
            options: [
                'К номенклатуре 1:100 000 добавляется номер в скобках',
                'К 1:50 000 добавляется строчная буква',
                'К 1:500 000 добавляется арабская цифра',
                'Самостоятельная буквенно-цифровая комбинация'
            ]
        },
        {
            prompt: 'Сколько колонок в миллионной разграфке?',
            correct: '60',
            options: ['60', '36', '90', '180']
        },
        {
            prompt: 'Что означает буква "Z" в номенклатуре?',
            correct: 'Приполярный лист (88°–90°)',
            options: ['Приполярный лист (88°–90°)', 'Запасной лист', 'Лист южного полушария', 'Ошибочная номенклатура']
        },
        {
            prompt: 'Можно ли встретить лист 1:50 000 с номером 145?',
            correct: 'Нет, максимальный номер 144',
            options: ['Нет, максимальный номер 144', 'Да, в высоких широтах', 'Да, для сдвоенных листов', 'Только в южном полушарии']
        },
        {
            prompt: 'Какую площадь в угловых минутах имеет лист 1:100 000?',
            correct: '20′×30′',
            options: ['20′×30′', '10′×15′', '40′×1°', '5′×7.5′']
        },
        {
            prompt: 'Какой префикс имеют листы 1:300 000?',
            correct: 'Римская цифра I–IX',
            options: ['Римская цифра I–IX', 'Арабская цифра 1–9', 'Буквы А–И', 'Строчные а–и']
        },
        {
            prompt: 'В чём особенность листов масштаба 1:200 000 в высоких широтах?',
            correct: 'Они сдваиваются по долготе',
            options: ['Они сдваиваются по долготе', 'Увеличиваются по широте', 'Делятся на большее число частей', 'Их номенклатура содержит букву "С"']
        },
        {
            prompt: 'Как записывается номенклатура сдвоенного миллионного листа?',
            correct: 'Буква ряда и две колонны через запятую',
            options: ['Буква ряда и две колонны через запятую', 'Буква ряда и одна удвоенная колонна', 'Две буквы ряда', 'Добавляется "сдв."']
        },
        {
            prompt: 'Каков размер листа 1:50 000?',
            correct: '10′×15′',
            options: ['10′×15′', '20′×30′', '5′×7.5′', '2.5′×3.75′']
        },
        {
            prompt: 'Из скольких частей состоит номенклатура листа 1:10 000?',
            correct: 'После 1:25 000 добавляется цифра 1–4',
            options: ['После 1:25 000 добавляется цифра 1–4', 'После 1:50 000 добавляется буква', 'Самостоятельный номер', 'Римская цифра']
        },
        {
            prompt: 'Что произойдёт с размером листа 1:1 000 000 на широте более 76°?',
            correct: 'Лист счетверяется – 24° по долготе',
            options: ['Лист счетверяется – 24° по долготе', 'Размер остаётся 6°', 'Лист удваивается', 'Лист делится пополам']
        },
        {
            prompt: 'Как обозначаются листы 1:2 000?',
            correct: 'Номер в скобках с буквой через дефис',
            options: ['Номер в скобках с буквой через дефис', 'Только строчная буква', 'Только номер', 'Римская цифра']
        },
        {
            prompt: 'С какого меридиана начинается счёт колонн миллионной разграфки?',
            correct: '180° з.д.',
            options: ['180° з.д.', '0° (Гринвич)', '90° в.д.', '180° в.д.']
        },
        {
            prompt: 'Ряд A миллионной разграфки находится на широте:',
            correct: '0°–4°',
            options: ['0°–4°', '4°–8°', '80°–84°', '0°–8°']
        },
        {
            prompt: 'Для какого масштаба используется деление 6×6?',
            correct: '1:200 000',
            options: ['1:200 000', '1:300 000', '1:100 000', '1:500 000']
        },
        {
            prompt: 'Какой масштаб имеет лист с номенклатурой O-40-37-Б-б?',
            correct: '1:25 000',
            options: ['1:25 000', '1:50 000', '1:100 000', '1:10 000']
        },
        {
            prompt: 'В каком полушарии возможен лист Z?',
            correct: 'Только в северном',
            options: ['Только в северном', 'Только в южном', 'В обоих', 'Ни в одном']
        },
        {
            prompt: 'Какие символы никогда не используются в номенклатуре для 1:25 000?',
            correct: 'Прописные буквы А–Г',
            options: ['Прописные буквы А–Г', 'Строчные буквы а–г', 'Цифры', 'Дефис']
        }
    ];
    const q = pool[Math.floor(Math.random() * pool.length)];
    return {
        prompt: q.prompt,
        correctAnswer: q.correct,
        options: shuffle(q.options),
        type: 'options'
    };
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function renderBoundsDiagram(question) {
    const container = trainerDiagramContainer;
    if (!container || !question.bounds) return;
    container.style.display = 'block';
    container.innerHTML = '';
    const north = ddToDMS(question.bounds.getNorth(), true);
    const south = ddToDMS(question.bounds.getSouth(), true);
    const west = ddToDMS(question.bounds.getWest(), false);
    const east = ddToDMS(question.bounds.getEast(), false);
    const wrapper = document.createElement('div');
    wrapper.className = 'bounds-diagram';
    wrapper.innerHTML = `
        <div class="bounds-diagram-top-label">${north}</div>
        <div class="bounds-diagram-middle">
            <div class="bounds-diagram-side-label">${west}</div>
            <div class="bounds-diagram-sheet"></div>
            <div class="bounds-diagram-side-label">${east}</div>
        </div>
        <div class="bounds-diagram-bottom-label">${south}</div>
    `;
    container.appendChild(wrapper);
}

function startPractice() {
    trainerPracticeState = {
        topic: null,
        questionCount: 0,
        correctCount: 0,
        currentQuestion: null,
        answered: false
    };
    if (map.hasLayer(gridLayer)) gridLayer.remove();
    if (currentSheetLayer) {
        map.removeLayer(currentSheetLayer);
        currentSheetLayer = null;
    }
    clearBoundaryLabels();
    neighborLayers.clearLayers();
    trainerCategorySelection.style.display = 'block';
    trainerQuestionArea.style.display = 'none';
    updatePracticeScore();
    trainerBackToCategoriesBtn.style.display = 'none';
}

function selectPracticeTopic(topic) {
    trainerPracticeState.topic = topic;
    trainerPracticeState.questionCount = 0;
    trainerPracticeState.correctCount = 0;
    trainerCategorySelection.style.display = 'none';
    trainerQuestionArea.style.display = 'block';
    trainerNextBtn.style.display = 'none';
    trainerBackToCategoriesBtn.style.display = 'block';
    neighborLayers.clearLayers();
    if (currentSheetLayer) map.removeLayer(currentSheetLayer);
    generateNextQuestion();
}

function renderOptions(options) {
    trainerOptionsContainer.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.addEventListener('click', () => {
            if (trainerPracticeState.answered) return;
            checkAnswer(opt);
        });
        trainerOptionsContainer.appendChild(btn);
    });
}

function renderNeighborInputs(question) {
    const container = trainerOptionsContainer;
    container.innerHTML = `
        <div class="neighbor-inputs">
            <div class="neighbor-field">
                <span class="direction">Северный:</span>
                <input type="text" id="neighbor-north" placeholder="Введите номенклатуру">
            </div>
            <div class="neighbor-field">
                <span class="direction">Южный:</span>
                <input type="text" id="neighbor-south" placeholder="Введите номенклатуру">
            </div>
            <div class="neighbor-field">
                <span class="direction">Западный:</span>
                <input type="text" id="neighbor-west" placeholder="Введите номенклатуру">
            </div>
            <div class="neighbor-field">
                <span class="direction">Восточный:</span>
                <input type="text" id="neighbor-east" placeholder="Введите номенклатуру">
            </div>
            <button id="show-neighbors-btn" class="show-map-btn">Показать лист</button>
        </div>
    `;
    document.getElementById('show-neighbors-btn').addEventListener('click', () => {
        if (currentNeighborQuestion) {
            showNeighborsOnMapNoLabels(currentNeighborQuestion);
            map.fitBounds(currentNeighborQuestion.baseBounds.pad(1.5));
        }
    });
}

function checkAnswer(userAnswer) {
    if (trainerPracticeState.answered) return;
    trainerPracticeState.questionCount++;
    const q = trainerPracticeState.currentQuestion;
    const correct = q.correctAnswer;
    const isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(correct);
    if (isCorrect) trainerPracticeState.correctCount++;
    let extra = '';
    if (!isCorrect && q.correction) {
        extra = ` (верная запись: <b>${q.correction}</b>)`;
        if (q.explanation) {
            extra += `<br><span style="font-size: 0.9em; color: #666;">Пояснение: ${q.explanation}</span>`;
        }
    }
    trainerFeedback.innerHTML = isCorrect
        ? '<span style="color: green;">✓ Правильно</span>'
        : `<span style="color: red;">✗ Неправильно. Правильный ответ: <b>${correct}</b>${extra}</span>`;
    trainerPracticeState.answered = true;
    trainerCheckBtn.style.display = 'none';
    trainerNextBtn.style.display = 'block';
    updatePracticeScore();
}

function checkNeighborAnswers(question) {
    if (trainerPracticeState.answered) return;
    const getVal = (dir) => document.getElementById(`neighbor-${dir}`)?.value || '';
    const answers = {
        north: getVal('north'),
        south: getVal('south'),
        west: getVal('west'),
        east: getVal('east')
    };
    let correctCount = 0;
    const results = {};
    const dirMap = {
        north: 'Северный',
        south: 'Южный',
        west: 'Западный',
        east: 'Восточный'
    };
    for (const dir of Object.keys(question.neighbors)) {
        const correct = question.neighbors[dir]?.nomenclature || '';
        const user = answers[dir];
        results[dir] = normalizeAnswer(user) === normalizeAnswer(correct);
        if (results[dir]) correctCount++;
    }
    const total = Object.keys(question.neighbors).length;
    trainerPracticeState.correctCount += correctCount;
    trainerPracticeState.questionCount++;
    const feedback = [];
    for (const dir of Object.keys(question.neighbors)) {
        const correct = question.neighbors[dir]?.nomenclature || '';
        const user = answers[dir];
        const ok = results[dir];
        feedback.push(
            `<span style="color: ${ok ? 'green' : 'red'}">${ok ? '✓' : '✗'} ${dirMap[dir]}: ${ok ? user : `${user || '—'} → ${correct}`}</span>`
        );
    }
    trainerFeedback.innerHTML = `Правильно ${correctCount} из ${total}.<br>${feedback.join('<br>')}`;
    trainerPracticeState.answered = true;
    trainerCheckBtn.style.display = 'none';
    trainerNextBtn.style.display = 'block';
    updatePracticeScore();
    showNeighborsOnMap(question);
}

function normalizeAnswer(str) {
    return str.replace(/\s+/g, '').replace(/[\.\,]/g, '').toLowerCase();
}

function updatePracticeScore() {
    trainerScoreDisplay.textContent = `Вопросов: ${trainerPracticeState.questionCount}   Правильных: ${trainerPracticeState.correctCount}`;
}

function showNeighborsOnMapNoLabels(question) {
    neighborLayers.clearLayers();
    const colors = { north: '#4caf50', south: '#ff9800', west: '#2196f3', east: '#e91e63' };
    for (const dir of Object.keys(question.neighbors)) {
        const neighbor = question.neighbors[dir];
        if (!neighbor || !neighbor.bounds) continue;
        const geojson = {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [densifyBounds(neighbor.bounds, 8)] }
        };
        L.geoJSON(geojson, {
            style: { color: colors[dir], weight: 2, fillOpacity: 0.1, fillColor: colors[dir] }
        }).addTo(neighborLayers);
    }
}

function showNeighborsOnMap(question) {
    neighborLayers.clearLayers();
    const colors = { north: '#4caf50', south: '#ff9800', west: '#2196f3', east: '#e91e63' };
    for (const dir of Object.keys(question.neighbors)) {
        const neighbor = question.neighbors[dir];
        if (!neighbor || !neighbor.bounds) continue;
        const geojson = {
            type: 'Feature',
            properties: { nomenclature: neighbor.nomenclature },
            geometry: { type: 'Polygon', coordinates: [densifyBounds(neighbor.bounds, 8)] }
        };
        const layer = L.geoJSON(geojson, {
            style: { color: colors[dir], weight: 2, fillOpacity: 0.1, fillColor: colors[dir] }
        }).addTo(neighborLayers);
        layer.bindTooltip(neighbor.nomenclature, {
            permanent: true,
            direction: 'center',
            className: 'sheet-label'
        });
    }
}

L.latLngBounds.prototype.pad = function(ratio) {
    const latPad = (this.getNorth() - this.getSouth()) * (ratio - 1) / 2;
    const lngPad = (this.getEast() - this.getWest()) * (ratio - 1) / 2;
    return L.latLngBounds(
        L.latLng(this.getSouth() - latPad, this.getWest() - lngPad),
        L.latLng(this.getNorth() + latPad, this.getEast() + lngPad)
    );
};

function endPractice() {
    trainerCategorySelection.style.display = 'block';
    trainerQuestionArea.style.display = 'none';
    trainerPracticeState.topic = null;
    clearBoundaryLabels();
    neighborLayers.clearLayers();
    if (currentSheetLayer) {
        map.removeLayer(currentSheetLayer);
        currentSheetLayer = null;
    }
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
    historyStack = [];
    activeParent = null;
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
        if (tab.dataset.tab === 'practice') startPractice();
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

document.querySelectorAll('.category-buttons button').forEach(btn => {
    btn.addEventListener('click', () => {
        selectPracticeTopic(btn.dataset.topic);
    });
});

trainerCheckBtn.addEventListener('click', () => {
    if (trainerPracticeState.answered) return;
    const q = trainerPracticeState.currentQuestion;
    if (!q) return;
    if (q.type === 'input') {
        checkAnswer(trainerAnswerInput.value);
    } else if (q.type === 'neighbor-input') {
        checkNeighborAnswers(q);
    }
});

trainerNextBtn.addEventListener('click', () => {
    generateNextQuestion();
});

trainerBackToCategoriesBtn.addEventListener('click', () => {
    endPractice();
});