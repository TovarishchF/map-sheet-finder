// --- Глобальные переменные ---
const map = L.map('map').setView([55.751244, 37.618423], 6);
let currentSheetLayer = null;
let gridLayer = L.layerGroup().addTo(map);
let markerLayer = L.layerGroup().addTo(map);
let activeParent = null;

let historyStack = [];
const MAX_HISTORY = 50;

const errorEl = document.getElementById('error-message');
const backBtn = document.getElementById('back-btn');
const nextScalePanel = document.getElementById('next-scale-panel');
const nextScaleButtons = document.getElementById('next-scale-buttons');
const ambiguousModal = document.getElementById('ambiguous-scale-modal');
const modalOverlay = document.getElementById('modal-overlay');
const modalMessage = document.getElementById('modal-message');
const selectOption1 = document.getElementById('select-option1');
const selectOption2 = document.getElementById('select-option2');

let pendingNomenclature = null;

function showError(text) {
    errorEl.textContent = text;
    errorEl.style.display = 'block';
}
function hideError() {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
}

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

// --- Иерархия масштабов ---
const nextScaleOptions = {
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

// --- Параметры деления ---
const divisions = {
    '500k': { rows: 2,  cols: 2,   labels: (i, j) => ['А', 'Б', 'В', 'Г'][i * 2 + j] },
    '300k': { rows: 3,  cols: 3,   labels: (i, j) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][i * 3 + j] },
    '200k': { rows: 6,  cols: 6,   labels: (i, j) => {
        const num = i * 6 + j + 1;
        return arabicToRoman(num);
    }},
    '100k': { rows: 12, cols: 12,  labels: (i, j) => (i * 12 + j + 1).toString() },
    '50k':  { rows: 2,  cols: 2,   labels: (i, j) => ['А', 'Б', 'В', 'Г'][i * 2 + j] },
    '25k':  { rows: 2,  cols: 2,   labels: (i, j) => ['а', 'б', 'в', 'г'][i * 2 + j] },
    '10k':  { rows: 2,  cols: 2,   labels: (i, j) => (i * 2 + j + 1).toString() },
    '5k':   { rows: 16, cols: 16,  labels: (i, j) => (i * 16 + j + 1).toString() },
    '2k':   { rows: 3,  cols: 3,   labels: (i, j) => ['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и'][i * 3 + j] }
};

function arabicToRoman(num) {
    if (num < 1 || num > 36) return '';
    const digits = [
        ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'],
        ['', 'X', 'XX', 'XXX']
    ];
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return digits[1][tens] + digits[0][ones];
}

function isSouthern(nomenclature) {
    return nomenclature.includes('(Ю.П.)') || nomenclature.includes('(ю.п.)');
}
function cleanNomenclature(nom) {
    return nom.replace(/\s*\(Ю\.П\.\)\s*/i, '').trim();
}

// --- Проверка неоднозначности: только римские I-IX ---
function checkAmbiguity(nomenclature) {
    const cleaned = cleanNomenclature(nomenclature);
    const parts = cleaned.split('-');
    if (parts.length < 2) return null;

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (/^[IVX]+$/i.test(part)) {
            const romanValues = { 'I':1, 'II':2, 'III':3, 'IV':4, 'V':5, 'VI':6, 'VII':7, 'VIII':8, 'IX':9 };
            if (romanValues.hasOwnProperty(part.toUpperCase())) {
                return 'roman';
            }
        }
    }
    return null;
}

// --- Разбор номенклатуры с возможным принудительным масштабом ---
function nomenclatureToBounds(nomenclature, forcedScale = null) {
    let nom = nomenclature.trim();
    const southern = isSouthern(nom);
    nom = cleanNomenclature(nom);

    if (/^Z(?:-1)?$/i.test(nom)) {
        if (southern) throw new Error('Лист Z не существует в южном полушарии');
        return L.latLngBounds(L.latLng(88, -180), L.latLng(90, 180));
    }

    let baseNom = nom;
    let bracketPart = '';
    const bracketMatch = nom.match(/^(.+?)\(([^)]+)\)$/);
    if (bracketMatch) {
        baseNom = bracketMatch[1].trim();
        bracketPart = bracketMatch[2].trim();
    }

    const parts = baseNom.split('-');
    let millionPart = parts[0];

    if (/^[A-VZ]$/i.test(millionPart) && parts.length > 1 && /^\d+$/.test(parts[1])) {
        millionPart = millionPart + '-' + parts[1];
        parts.splice(1, 1);
    }
    if (/^[A-V]\d{1,2}$/i.test(millionPart) && parts.length === 1) {
        millionPart = millionPart[0] + '-' + millionPart.slice(1);
        parts[0] = millionPart;
    }

    const match = millionPart.match(/^([A-V])-(\d+)$/i);
    if (!match) throw new Error(`Неверный формат миллионного листа: ${millionPart}`);

    const rowLetter = match[1].toUpperCase();
    const colNumber = parseInt(match[2], 10);
    if (rowLetter < 'A' || rowLetter > 'V') throw new Error(`Недопустимый ряд: ${rowLetter}`);
    if (colNumber < 1 || colNumber > 60) throw new Error(`Недопустимая колонна: ${colNumber}`);

    let rowIndex = rowLetter.charCodeAt(0) - 'A'.charCodeAt(0);
    let latSouth, latNorth;
    if (southern) {
        latSouth = - (rowIndex + 1) * 4;
        latNorth = - rowIndex * 4;
    } else {
        latSouth = rowIndex * 4;
        latNorth = (rowIndex + 1) * 4;
    }

    let lonWest = -180 + (colNumber - 1) * 6;
    let lonEast = lonWest + 6;

    if (!southern) {
        if (latSouth >= 60) {
            if (colNumber % 2 !== 0) lonEast = lonWest + 12;
            else throw new Error(`Лист ${nomenclature} не существует (сдвоенный)`);
        }
        if (latSouth >= 76) {
            if (colNumber % 4 === 1) lonEast = lonWest + 24;
            else throw new Error(`Лист ${nomenclature} не существует (счетверённый)`);
        }
        if (latSouth >= 88) { lonWest = -180; lonEast = 180; }
    }

    let currentBounds = L.latLngBounds(L.latLng(latSouth, lonWest), L.latLng(latNorth, lonEast));

    // Определяем последовательность масштабов на основе количества частей и их типов
    const numParts = parts.length;
    const scaleSequence = [];

    if (numParts >= 2) {
        // Части после миллионного листа
        const extraParts = parts.slice(1);

        for (let i = 0; i < extraParts.length; i++) {
            const part = extraParts[i];
            // Определяем масштаб по контексту
            if (/^\d+$/.test(part) && parseInt(part) >= 1 && parseInt(part) <= 144) {
                // Может быть 100k, но если это уже не первый раз, то может быть 10k или 5k
                // Если это третья часть (индекс 2) и перед ней была кириллица — это 10k?
                // Используем эвристику: если часть одна и число до 144 -> 100k
                // Если частей больше и предыдущая часть — буква, то 10k
                if (i === 0) {
                    scaleSequence.push('100k');
                } else {
                    // Проверяем предыдущую часть
                    const prev = extraParts[i-1];
                    if (/^[абвг]$/.test(prev)) {
                        scaleSequence.push('10k');
                    } else if (/^\d+$/.test(prev)) {
                        scaleSequence.push('5k'); // на самом деле 5k будет в скобках, сюда не попадём
                    } else {
                        scaleSequence.push('100k'); // fallback
                    }
                }
            } else if (/^[АБВГ]$/.test(part)) {
                // Может быть 500k (если это единственная часть) или 50k (если перед ней число)
                if (i === 0 && extraParts.length === 1) {
                    scaleSequence.push('500k');
                } else {
                    scaleSequence.push('50k');
                }
            } else if (/^[абвг]$/.test(part)) {
                scaleSequence.push('25k');
            } else if (/^[IVX]+$/i.test(part)) {
                // Римские цифры: если I-IX и forcedScale задан, используем его, иначе 200k
                if (forcedScale === '300k' && /^[IVX]+$/i.test(part) && ['I','II','III','IV','V','VI','VII','VIII','IX'].includes(part.toUpperCase())) {
                    scaleSequence.push('300k');
                } else {
                    scaleSequence.push('200k');
                }
            } else if (/^[IVXLCDM]+$/i.test(part)) {
                scaleSequence.push('200k');
            } else {
                console.warn('Неизвестная часть номенклатуры:', part);
            }
        }
    }

    // Применяем деления последовательно
    for (let i = 0; i < scaleSequence.length; i++) {
        const scale = scaleSequence[i];
        const part = parts[i + 1]; // соответствующая часть
        const div = divisions[scale];
        if (!div) continue;

        const labels = [];
        for (let r = 0; r < div.rows; r++) {
            for (let c = 0; c < div.cols; c++) {
                labels.push(div.labels(r, c));
            }
        }
        const idx = labels.indexOf(part);
        if (idx === -1) {
            console.warn(`Не найдена метка "${part}" для масштаба ${scale}`);
            continue;
        }
        const row = Math.floor(idx / div.cols);
        const col = idx % div.cols;
        const latStep = (currentBounds.getNorth() - currentBounds.getSouth()) / div.rows;
        const lngStep = (currentBounds.getEast() - currentBounds.getWest()) / div.cols;
        const sheetNorth = currentBounds.getNorth() - row * latStep;
        const sheetSouth = sheetNorth - latStep;
        const sheetWest = currentBounds.getWest() + col * lngStep;
        const sheetEast = sheetWest + lngStep;
        currentBounds = L.latLngBounds(L.latLng(sheetSouth, sheetWest), L.latLng(sheetNorth, sheetEast));
    }

    // Обработка скобочной части (5k и 2k) — оставляем без изменений
    if (bracketPart) {
        const bracketSubParts = bracketPart.split('-').map(s => s.trim());
        const numberPart = bracketSubParts[0];
        const letterPart = bracketSubParts.length > 1 ? bracketSubParts[1] : null;

        const div5k = divisions['5k'];
        const labels5k = [];
        for (let r = 0; r < div5k.rows; r++) {
            for (let c = 0; c < div5k.cols; c++) {
                labels5k.push(div5k.labels(r, c));
            }
        }
        const idx5k = labels5k.indexOf(numberPart);
        if (idx5k === -1) throw new Error(`Неверный номер листа 1:5000: ${numberPart}`);
        const row5k = Math.floor(idx5k / div5k.cols);
        const col5k = idx5k % div5k.cols;
        const latStep5k = (currentBounds.getNorth() - currentBounds.getSouth()) / div5k.rows;
        const lngStep5k = (currentBounds.getEast() - currentBounds.getWest()) / div5k.cols;
        const north5k = currentBounds.getNorth() - row5k * latStep5k;
        const south5k = north5k - latStep5k;
        const west5k = currentBounds.getWest() + col5k * lngStep5k;
        const east5k = west5k + lngStep5k;
        currentBounds = L.latLngBounds(L.latLng(south5k, west5k), L.latLng(north5k, east5k));

        if (letterPart) {
            const div2k = divisions['2k'];
            const labels2k = [];
            for (let r = 0; r < div2k.rows; r++) {
                for (let c = 0; c < div2k.cols; c++) {
                    labels2k.push(div2k.labels(r, c));
                }
            }
            const idx2k = labels2k.indexOf(letterPart);
            if (idx2k === -1) throw new Error(`Неверная литера листа 1:2000: ${letterPart}`);
            const row2k = Math.floor(idx2k / div2k.cols);
            const col2k = idx2k % div2k.cols;
            const latStep2k = (currentBounds.getNorth() - currentBounds.getSouth()) / div2k.rows;
            const lngStep2k = (currentBounds.getEast() - currentBounds.getWest()) / div2k.cols;
            const north2k = currentBounds.getNorth() - row2k * latStep2k;
            const south2k = north2k - latStep2k;
            const west2k = currentBounds.getWest() + col2k * lngStep2k;
            const east2k = west2k + lngStep2k;
            currentBounds = L.latLngBounds(L.latLng(south2k, west2k), L.latLng(north2k, east2k));
        }
    }

    return currentBounds;
}

// --- Определение масштаба по номенклатуре (однозначное) ---
function getScaleFromNomenclature(nom, forcedScale = null) {
    const cleaned = cleanNomenclature(nom);

    // Если есть скобки — это 5k или 2k
    if (cleaned.includes('(')) {
        const afterBracket = cleaned.split('(')[1].split(')')[0];
        if (afterBracket.includes('-')) return '2k';
        else return '5k';
    }

    const parts = cleaned.split('-');
    const len = parts.length;

    // Миллионный лист: 1 или 2 части (например "N-37" или "N37")
    if (len === 1) return '1M';
    if (len === 2) {
        // Если вторая часть — число, это точно миллионный лист
        if (/^\d+$/.test(parts[1])) return '1M';
        // Иначе может быть что-то другое, но по умолчанию 1M
        return '1M';
    }

    // Анализ по количеству частей и типам
    const lastPart = parts[len - 1];
    const prevPart = parts[len - 2];

    // 1:500 000: 3 части, последняя — заглавная кириллица (А-Г)
    if (len === 3 && /^[АБВГ]$/.test(lastPart)) return '500k';

    // 1:300 000: 3 части, последняя — римская цифра (I-IX)
    if (len === 3 && /^[IVX]+$/i.test(lastPart)) {
        // Если принудительно задан масштаб, возвращаем его
        if (forcedScale === '300k') return '300k';
        // Иначе вернём 200k? Лучше вернуть '200k' или вызвать неоднозначность?
        // Поскольку у нас есть проверка на неоднозначность выше, сюда попадём только если forcedScale задан,
        // либо если римская цифра > IX (но они обрабатываются отдельно)
        return '200k';
    }

    // 1:200 000: 3 части, последняя — римская цифра > IX (X-XXXVI) — однозначно 200k
    if (len === 3 && /^[IVXLCDM]+$/i.test(lastPart) && !/^[IVX]+$/i.test(lastPart)) return '200k';

    // 1:100 000: 3 части, последняя — число (1-144)
    if (len === 3 && /^\d+$/.test(lastPart)) return '100k';

    // 1:50 000: 4 части, последняя — заглавная кириллица (А-Г), предпоследняя — число (1-144)
    if (len === 4 && /^[АБВГ]$/.test(lastPart) && /^\d+$/.test(prevPart)) return '50k';

    // 1:25 000: 5 частей, последняя — строчная кириллица (а-г), предпоследняя — заглавная кириллица
    if (len === 5 && /^[абвг]$/.test(lastPart) && /^[АБВГ]$/.test(prevPart)) return '25k';

    // 1:10 000: 6 частей, последняя — цифра (1-4), предпоследняя — строчная кириллица
    if (len === 6 && /^[1-4]$/.test(lastPart) && /^[абвг]$/.test(prevPart)) return '10k';

    // Дополнительные случаи для 5k/2k обработаны выше

    // Если не удалось определить, возвращаем 1M
    console.warn('Не удалось определить масштаб для:', nom);
    return '1M';
}

// --- Генерация дочерних листов ---
function generateSheetsInside(parentBounds, parentNom, targetScale) {
    const sheets = [];
    const div = divisions[targetScale];
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
            const sheetWest = west + j * lngStep;
            const sheetEast = sheetWest + lngStep;

            const sheetBounds = L.latLngBounds(
                L.latLng(rowSouth, sheetWest),
                L.latLng(rowNorth, sheetEast)
            );

            const suffix = div.labels(i, j);
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
            } else {
                nomenclature = `${cleanParent}-${suffix}`;
            }

            if (southern && !nomenclature.includes('(Ю.П.)')) {
                nomenclature += ' (Ю.П.)';
            }

            sheets.push({ bounds: sheetBounds, nomenclature });
        }
    }
    return sheets;
}

// --- Отрисовка сетки ---
function updateGrid() {
    gridLayer.clearLayers();
    let sheets = [];

    if (!activeParent) {
        const viewBounds = map.getBounds();
        const south = Math.floor(viewBounds.getSouth() / 4) * 4;
        const west = Math.floor(viewBounds.getWest() / 6) * 6;
        const north = viewBounds.getNorth();
        const east = viewBounds.getEast();
        let lat = south;
        while (lat < north) {
            let lng = west;
            while (lng < east) {
                const sheetBounds = L.latLngBounds(L.latLng(lat, lng), L.latLng(lat+4, lng+6));
                const absRow = Math.floor(lat / 4);
                let rowLetter, suffix = '';
                if (lat >= 0) {
                    rowLetter = String.fromCharCode('A'.charCodeAt(0) + absRow);
                } else {
                    rowLetter = String.fromCharCode('A'.charCodeAt(0) + Math.abs(absRow) - 1);
                    suffix = ' (Ю.П.)';
                }
                const colNumber = Math.floor((lng + 180) / 6) + 1;
                const nom = `${rowLetter}-${colNumber}${suffix}`;
                sheets.push({ bounds: sheetBounds, nomenclature: nom });
                lng += 6;
            }
            lat += 4;
        }
        document.getElementById('current-scale').textContent = '1:1,000,000';
    } else {
        if (activeParent.nextScale) {
            sheets = generateSheetsInside(activeParent.bounds, activeParent.nomenclature, activeParent.nextScale);
            const scaleTextMap = {
                '500k': '1:500,000', '300k': '1:300,000', '200k': '1:200,000',
                '100k': '1:100,000', '50k': '1:50,000', '25k': '1:25,000',
                '10k': '1:10,000', '5k': '1:5,000', '2k': '1:2,000'
            };
            document.getElementById('current-scale').textContent = scaleTextMap[activeParent.nextScale] || activeParent.nextScale;
        } else {
            document.getElementById('current-scale').textContent = '—';
        }
    }

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
                l.on('mouseover', () => l.setStyle({ weight: 3, fillOpacity: 0.15 }));
                l.on('mouseout', () => l.setStyle({ weight: 1, fillOpacity: 0 }));
            }
        }).addTo(gridLayer);

        let labelText = (!activeParent) ? sheet.nomenclature : sheet.nomenclature.split('-').pop();
        if (sheet.nomenclature.includes('(')) {
            const match = sheet.nomenclature.match(/\(([^)]+)\)/);
            if (match) labelText = match[1];
        }
        const icon = L.divIcon({ className: 'sheet-label', html: labelText, iconSize: null });
        L.marker(sheet.bounds.getCenter(), { icon, interactive: false }).addTo(gridLayer);
    });

    updateBackButtonState();
}

// --- Управление переходом к следующему масштабу ---
function proceedToNextScale(parentScale) {
    const options = nextScaleOptions[parentScale] || [];

    if (options.length === 0) {
        nextScalePanel.style.display = 'none';
        return false;
    }

    if (options.length === 1) {
        if (activeParent) {
            activeParent.nextScale = options[0];
            updateGrid();
            const scaleTextMap = {
                '500k': '1:500,000', '300k': '1:300,000', '200k': '1:200,000',
                '100k': '1:100,000', '50k': '1:50,000', '25k': '1:25,000',
                '10k': '1:10,000', '5k': '1:5,000', '2k': '1:2,000'
            };
            document.getElementById('current-scale').textContent = scaleTextMap[options[0]] || options[0];
        }
        nextScalePanel.style.display = 'none';
        return true;
    }

    // Несколько вариантов — панель выбора
    nextScaleButtons.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        const scaleNames = {
            '500k': '1:500 000', '300k': '1:300 000', '200k': '1:200 000',
            '100k': '1:100 000', '50k': '1:50 000', '5k': '1:5 000'
        };
        btn.textContent = scaleNames[opt] || opt;
        btn.addEventListener('click', () => {
            if (activeParent) {
                activeParent.nextScale = opt;
                updateGrid();
                nextScalePanel.style.display = 'none';
                const scaleTextMap = {
                    '500k': '1:500,000', '300k': '1:300,000', '200k': '1:200,000',
                    '100k': '1:100,000', '50k': '1:50,000', '25k': '1:25,000',
                    '10k': '1:10,000', '5k': '1:5,000', '2k': '1:2,000'
                };
                document.getElementById('current-scale').textContent = scaleTextMap[opt] || opt;
            }
        });
        nextScaleButtons.appendChild(btn);
    });
    nextScalePanel.style.display = 'block';
    return true;
}

// --- История ---
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
        document.getElementById('current-nomenclature').textContent = '—';
        document.getElementById('current-bounds').innerHTML = '—';
        map.setView([55.751244, 37.618423], 6);
        nextScalePanel.style.display = 'none';
    } else {
        activeParent = { nomenclature: prev.nomenclature, bounds: prev.bounds, scale: prev.scale };
        if (currentSheetLayer) map.removeLayer(currentSheetLayer);
        const bounds = activeParent.bounds;
        if (bounds) {
            const geojson = {
                type: 'Feature',
                properties: { nomenclature: activeParent.nomenclature },
                geometry: { type: 'Polygon', coordinates: [[
                    [bounds.getWest(), bounds.getSouth()], [bounds.getEast(), bounds.getSouth()],
                    [bounds.getEast(), bounds.getNorth()], [bounds.getWest(), bounds.getNorth()],
                    [bounds.getWest(), bounds.getSouth()]
                ]] }
            };
            currentSheetLayer = L.geoJSON(geojson, {
                style: { color: '#d32f2f', weight: 3, fillOpacity: 0.1 }
            }).addTo(map);
            document.getElementById('current-nomenclature').textContent = activeParent.nomenclature;
            document.getElementById('current-bounds').innerHTML =
                `С: ${bounds.getNorth().toFixed(4)}°<br>Ю: ${bounds.getSouth().toFixed(4)}°<br>З: ${bounds.getWest().toFixed(4)}°<br>В: ${bounds.getEast().toFixed(4)}°`;
            map.fitBounds(bounds, { padding: [50, 50] });
            proceedToNextScale(activeParent.scale);
        }
    }
    updateGrid();
    updateBackButtonState();
}
function updateBackButtonState() {
    if (backBtn) backBtn.disabled = historyStack.length <= 1;
}

// --- Финальное отображение листа ---
function finalizeDisplaySheet(nomenclature, bounds, scale) {
    if (activeParent) {
        pushHistoryState(activeParent.nomenclature, activeParent.bounds, activeParent.scale);
    } else {
        pushHistoryState(null, null, null);
    }

    activeParent = { nomenclature, bounds, scale };

    if (currentSheetLayer) map.removeLayer(currentSheetLayer);
    const geojson = {
        type: 'Feature', properties: { nomenclature },
        geometry: { type: 'Polygon', coordinates: [[
            [bounds.getWest(), bounds.getSouth()], [bounds.getEast(), bounds.getSouth()],
            [bounds.getEast(), bounds.getNorth()], [bounds.getWest(), bounds.getNorth()],
            [bounds.getWest(), bounds.getSouth()]
        ]] }
    };
    currentSheetLayer = L.geoJSON(geojson, {
        style: { color: '#d32f2f', weight: 3, fillOpacity: 0.1 }
    }).addTo(map);

    document.getElementById('current-nomenclature').textContent = nomenclature;
    document.getElementById('current-bounds').innerHTML =
        `С: ${bounds.getNorth().toFixed(4)}°<br>Ю: ${bounds.getSouth().toFixed(4)}°<br>З: ${bounds.getWest().toFixed(4)}°<br>В: ${bounds.getEast().toFixed(4)}°`;

    map.fitBounds(bounds, { padding: [50, 50] });

    gridLayer.clearLayers();
    const scaleTextMap = {
        '1M': '1:1,000,000', '500k': '1:500,000', '300k': '1:300,000', '200k': '1:200,000',
        '100k': '1:100,000', '50k': '1:50,000', '25k': '1:25,000',
        '10k': '1:10,000', '5k': '1:5,000', '2k': '1:2,000'
    };
    document.getElementById('current-scale').textContent = scaleTextMap[scale] || scale;

    proceedToNextScale(scale);
}

// --- Основная функция отображения листа ---
function displaySheet(nomenclature) {
    try {
        hideError();

        const ambType = checkAmbiguity(nomenclature);
        if (ambType === 'roman') {
            pendingNomenclature = nomenclature;
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

// --- Обработчики модального окна ---
function resolveAmbiguity(choice) {
    if (!pendingNomenclature) return;

    const forcedScale = choice === 'option1' ? '300k' : '200k';

    try {
        const bounds = nomenclatureToBounds(pendingNomenclature, forcedScale);
        const scale = getScaleFromNomenclature(pendingNomenclature, forcedScale);
        finalizeDisplaySheet(pendingNomenclature, bounds, scale);
    } catch (e) {
        showError(e.message);
    }

    ambiguousModal.style.display = 'none';
    modalOverlay.style.display = 'none';
    pendingNomenclature = null;
}

selectOption1.addEventListener('click', () => resolveAmbiguity('option1'));
selectOption2.addEventListener('click', () => resolveAmbiguity('option2'));
modalOverlay.addEventListener('click', () => {
    ambiguousModal.style.display = 'none';
    modalOverlay.style.display = 'none';
    pendingNomenclature = null;
});

// --- Переход по координатам ---
function goToCoordinates(lat, lng) {
    if (isNaN(lat) || isNaN(lng)) throw new Error('Координаты должны быть числами');
    if (lat < -90 || lat > 90) throw new Error('Широта от -90 до 90');
    if (lng < -180 || lng > 180) throw new Error('Долгота от -180 до 180');

    markerLayer.clearLayers();
    L.marker([lat, lng]).addTo(markerLayer).bindPopup(`${lat.toFixed(5)}°, ${lng.toFixed(5)}°`).openPopup();
    map.setView([lat, lng], 10);

    const southern = lat < 0;
    const absRow = Math.floor(Math.abs(lat) / 4);
    let rowLetter, suffix = '';
    if (southern) {
        rowLetter = String.fromCharCode('A'.charCodeAt(0) + absRow);
        suffix = ' (Ю.П.)';
    } else {
        rowLetter = String.fromCharCode('A'.charCodeAt(0) + absRow);
    }
    const colNumber = Math.floor((lng + 180) / 6) + 1;
    const base = `${rowLetter}-${colNumber}${suffix}`;

    const millionSouth = southern ? - (absRow + 1) * 4 : absRow * 4;
    const millionNorth = millionSouth + 4;
    const millionWest = -180 + (colNumber - 1) * 6;
    const latStep = 4 / 12;
    const lngStep = 6 / 12;
    const row = Math.floor((millionNorth - lat) / latStep);
    const col = Math.floor((lng - millionWest) / lngStep);
    const num = row * 12 + col + 1;
    displaySheet(`${base}-${num}`);
}

// --- Обработчики интерфейса ---
map.on('moveend', updateGrid);

document.getElementById('search-btn').addEventListener('click', () => {
    const val = document.getElementById('search-input').value.trim();
    val ? displaySheet(val) : showError('Введите номенклатуру');
});

document.getElementById('go-coords-btn').addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('lat-input').value);
    const lng = parseFloat(document.getElementById('lng-input').value);
    try { goToCoordinates(lat, lng); hideError(); } catch(e) { showError(e.message); }
});

if (backBtn) backBtn.addEventListener('click', goBack);

window.addEventListener('load', () => {
    historyStack = [{ nomenclature: null, bounds: null, scale: null }];
    updateGrid();
    hideError();
    updateBackButtonState();
    nextScalePanel.style.display = 'none';
});