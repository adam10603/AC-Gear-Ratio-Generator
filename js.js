function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(v, minimum, maximum) {
    if (v < minimum) return minimum;
    else if (v > maximum) return maximum;
    else return v;
}

function round(v, decimals = 0) {
    if (decimals < 0) return v;
    const mult = Math.pow(10, decimals);
    return v >= 0
        ? Math.floor(v * mult + 0.5) / mult
        : Math.ceil(v * mult - 0.5) / mult;
}

function isInputValid(value, minimum, maximum) {
    let parsed = parseFloat(value);

    if (isNaN(parsed)) return false;

    return (value >= minimum && value <= maximum);
}

function extractBool(input) {
    return !!input;
}

const ATAN_1 = 0.78539816339744830961566084581987572105; // 45° in radians

function S0(progress, firstRatio, lastRatio) {
    return 1.0 / lerp(1.0 / firstRatio, 1.0 / lastRatio, progress);
}

function S1(progress, lastRatio, firstGearAngle) {
    return lastRatio * Math.tan(lerp(firstGearAngle, ATAN_1, progress));
}

function calculateGearRatios(nGears, firstRatio, lastRatio, shapeFactor) {
    let ratios = [];
    ratios[0] = firstRatio;

    if (nGears < 2) return ratios;

    ratios[nGears - 1] = lastRatio;

    if (nGears < 3) return ratios;

    let firstGearAngle = Math.atan(firstRatio / lastRatio);
    let progressDiv = nGears - 1;

    for (let gear = 1; gear < nGears - 1; gear++) {
        let progress = gear / progressDiv;

        let invS0 = 1.0 / S0(progress, firstRatio, lastRatio);
        let invS1 = 1.0 / S1(progress, lastRatio, firstGearAngle);

        let invRatio = lerp(invS0, invS1, shapeFactor);
        ratios[gear] = 1.0 / invRatio;
    }

    return ratios;
}

// ================= Gear teeth combinations =================

function calculatePossibleRatios(minGearTeeth, maxGearTeeth) {
    let allAvailableRatios = [];
    for (let i = minGearTeeth; i <= maxGearTeeth; i++) {
        for (let j = minGearTeeth; j <= maxGearTeeth; j++) {
            allAvailableRatios.push({
                text: `${i}//${j}`,
                ratio: j / i,
                inverseRatio: i / j
            });
        }
    }
    allAvailableRatios.sort((a, b) => a.inverseRatio - b.inverseRatio);

    let ret = [];
    ret.push(allAvailableRatios[0]);

    // removing duplicate ratios from the list
    for (let v of allAvailableRatios) {
        if (Math.abs(ret[ret.length - 1].inverseRatio - v.inverseRatio) < 1e-6) continue;
        ret.push(v);
    }

    return ret;
}

let availableRatios = calculatePossibleRatios(7, 50);

function findBestRatio(targetInverseRatio) {
    let low = 0;
    let high = availableRatios.length - 1;

    if (targetInverseRatio <= availableRatios[0].inverseRatio)
        return availableRatios[0];
    if (targetInverseRatio >= availableRatios[high].inverseRatio)
        return availableRatios[high];

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const value = availableRatios[mid].inverseRatio;
        if (value < targetInverseRatio) low = mid + 1;
        else high = mid - 1;
    }

    let lower = availableRatios[high];
    let upper = availableRatios[low];

    return Math.abs(lower.inverseRatio - targetInverseRatio)
        <= Math.abs(upper.inverseRatio - targetInverseRatio)
        ? lower : upper;
}

// ================= UI generation =================

const configFields = [
    ["numGears", "Number of gears", parseInt, 2, 10, 6],
    ["defaultFirstGear", "Default ratio of 1st", parseFloat, 0.15, 7.0, 3.5],
    ["defaultLastGear", "Default ratio of last", parseFloat, 0.15, 7.0, 1.5],
    ["sFactor", "Distribution factor", parseFloat, 0.0, 1.0, 0.6],
    ["defaultFinalDrive", "Default ratio of final drive", parseFloat, 0.15, 7.0, 2.667],
    ["stepsPerGear", "Gear slider clicks", parseInt, 1, 20, 15],
    ["stepsFinal", "Final drive slider clicks", parseInt, 1, 20, 3],
    ["finalDriveSpeedChangeRatio", "Final drive slider step", parseFloat, 0.01, 0.2, 0.03333],
    ["gearStepsOverlap", "Extended gear sliders", extractBool, false, true, true]
];

const configTooltips = {
    "numGears": "Number of gears that the car has (excluding neutral and reverse).",
    "defaultFirstGear": "Desired default ratio of 1st gear, between 0.15 - 7.0.<br><br>For ideal performance it should be short enough to not bog down at race starts but long enough to avoid excessive wheelspin.",
    "defaultLastGear": "Desired default ratio of last gear, between 0.15 - 7.0.<br><br>A good last gear should make the top speed of the car line up with the peak power RPM of the engine (or just slightly after it, if possible without hitting the limiter).<br><br>For example a good top speed reference is the end of the Monza straight.",
    "sFactor": "Determines the distribution of the default gear ratios, between 0.0 - 1.0.<br><br>0.0 is a good default for most cars.<br><br>At 0.0 the top speeds of each gear will be evenly spaced, which results in larger RPM drops in lower gears and smaller RPM drops in higher gears.<br><br>At 1.0 the lower gears become more closely spaced and the higher gears move further apart, which works best if the peak power of the engine sits on a wide and flat area of the power curve.<br><br>Refer to the graph to see the effects in practice!",
    "defaultFinalDrive": "Desired default ratio of the final drive.<br><br>Just set it to a value that allows the first and last gear ratios above to perform ideally with the default setup of the car.",
    "stepsPerGear": "How many steps should each gear slider have on the setup screen, between 1 - 100.<br><br>More steps = more granular adjustment of each gear.<br><br>Try to use odd numbers (like 11 or 13) since that allows the default ratios to sit right in the middle of the sliders.<br><br>Too many steps could result in duplicate gear ratios in the output, but you'll be warned if that's the case.",
    "stepsFinal": "How many steps the final drive slider will have on the setup screen, between 1 - 100.<br><br>More steps = a winder range of adjustment.<br><br>Odd numbers work well here too, so the default can be in the middle.",
    "finalDriveSpeedChangeRatio": "How much 1 click of final drive adjustment will change the top speed.<br><br>For example 0.03 means 3% higher top speed if the final drive is increased by 1 step on the setup screen.",
    "gearStepsOverlap": "Doubles the range of the gear ratio sliders (not the final drive) by allowing their adjustment ranges to overlap.<br><br>When this is enabled it's best to increase the number of gear slider clicks to maintain granularity, since each slider will now cover a bigger range."
};

function initPage() {
    let inputsTable = document.getElementById("inputs_table");

    for (let [id, label, extractor, minimum, maximum, defaultValue] of configFields) {
        let tableRow = document.createElement("tr");
        if (extractor === extractBool) {
            tableRow.innerHTML += `<td><div class="tooltip">${label}<span class="tooltiptext">${configTooltips[id]}</span></div></td>`;
            tableRow.innerHTML += `<td>=</td>`;
            tableRow.innerHTML += `<td><input type="checkbox" id="${id}" name="${id}" ${defaultValue ? "checked" : ""}></td>`;
        } else {
            tableRow.innerHTML += `<td><div class="tooltip">${label}<span class="tooltiptext">${configTooltips[id]}</span></div></td>`;
            tableRow.innerHTML += `<td>=</td>`;
            tableRow.innerHTML += `<td><input type="text" id="${id}" name="${id}" class="selectable" value="${defaultValue}"></td>`;
        }
        inputsTable.appendChild(tableRow);
    }

    let lastRow = document.createElement("tr");
    lastRow.innerHTML = "<button onclick=\"run()\">Generate Output</button>";
    lastRow.style = "padding: 42px;";
    inputsTable.appendChild(lastRow);

    // graph stuff

    let bodyStyle = window.getComputedStyle(document.body);
    Chart.defaults.font.family = bodyStyle.fontFamily;
    Chart.defaults.font.size = bodyStyle.getPropertyValue("--small-font-size");
    Chart.defaults.color = bodyStyle.color;
    Chart.defaults.borderColor = bodyStyle.getPropertyValue("--dark-bg");
    Chart.defaults.plugins.legend = false;
    Chart.defaults.interaction = false;
    Chart.defaults.animation = false;
    Chart.defaults.responsive = true;
    Chart.defaults.aspectRatio = 1.25;
    Chart.defaults.plugins.title.display = true;
    Chart.defaults.plugins.title.text = "Default gear ratios (from drivetrain.ini)";
    Chart.defaults.plugins.title.align = "center";
    Chart.defaults.plugins.title.color = bodyStyle.color;
    Chart.defaults.plugins.colors.enabled = false;
    Chart.defaults.datasets.line.borderWidth = 3;
    Chart.defaults.datasets.line.borderColor = "#3b9fff";
    Chart.defaults.datasets.line.fill = false;
    // Chart.defaults.datasets.line.pointRadius = 0;
    Chart.defaults.datasets.line.pointRadius = 1.5;
    Chart.defaults.datasets.line.pointBorderWidth = 3;
    Chart.defaults.datasets.line.tension = 0; // straight lines

    drawBlankGraph();
}

// ================= Output building =================

function getFileName(n) {
    if (n === 1) return "1st.rto";
    else if (n === 2) return "2nd.rto";
    else if (n === 3) return "3rd.rto";
    else return `${n}th.rto`;
}

function getSetupSliderName(n) {
    if (n === 1) return "First Gear";
    else if (n === 2) return "Second Gear";
    else if (n === 3) return "Third Gear";
    else if (n === 4) return "Fourth Gear";
    else if (n === 5) return "Fifth Gear";
    else if (n === 6) return "Sixth Gear";
    else if (n === 7) return "Seventh Gear";
    else if (n === 8) return "Eighth Gear";
    else if (n === 9) return "Ninth Gear";
    else if (n === 10) return "Tenth Gear";
    else if (n === 11) return "Eleventh Gear";
    else if (n === 12) return "Twelfth Gear";
    else if (n === "final") return "Final Gear Ratio";
    else return `${n}th Gear`; // shouldnt be needed
}

// returns null if duplicate ratios are detected
function buildRealRatioSet(gearNumber, nSteps, rangeStart, rangeEnd, defaultInvRatio, defaultGearSetOut, graphGearSetInvOut) {
    let text = "";
    let halfwayIndex = Math.floor((nSteps - 1) / 2);
    let uniqueOutputRatios = new Set();

    // console.log(`${gearNumber}, ${nSteps}, ${rangeStart}, ${rangeEnd}`);

    for (let step = 0; step < nSteps; step++) {
        // ensuring the default ratio is always used as-is, and handling the steps below and above it separately
        let targetInv = defaultInvRatio;
        if (nSteps > 1) {
            if (step <= halfwayIndex) {
                targetInv = lerp(rangeStart, defaultInvRatio, step / halfwayIndex);
            } else {
                targetInv = lerp(defaultInvRatio, rangeEnd, (step - halfwayIndex) / halfwayIndex);
            }
        }

        let result = findBestRatio(targetInv);
        let ratioText = round(result.ratio, 3).toString();

        if (uniqueOutputRatios.has(ratioText)) return null;
        uniqueOutputRatios.add(ratioText);

        if (step === halfwayIndex) {
            defaultGearSetOut[gearNumber] = ratioText;
            graphGearSetInvOut[gearNumber] = result.inverseRatio;
        }

        text += `${result.text}|${ratioText}\n`;
    }

    return text;
}

// ================= Graph =================

let graph = null;

function drawBlankGraph() {
    drawGraph({}, 0);
}

function drawGraph(graphGearsInv, numGears) {
    if (!graph) {
        graph = new Chart(document.getElementById("graph_canvas"), {
            type: "line",
            data: gearDataToChartData(graphGearsInv, numGears),
            options: {
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Speed (normalized)" }
                    },
                    y: {
                        type: "linear",
                        title: { display: true, text: "RPM (normalized)" }
                    }
                }
            }
        });
    } else {
        graph.data = gearDataToChartData(graphGearsInv, numGears);
        graph.update();
    }
}

function gearDataToChartData(graphGearsInv, numGears) {
    let ret = { datasets: [] };
    let lastGearInv = graphGearsInv[numGears];
    function makeDataPoint(x, y) {
        return { x: clamp(x, 0.0, 1.0), y: clamp(y, 0.0, 1.0) }
    }
    for (i = 1; i <= numGears; i++) {
        ret.datasets.push({
            label: `Gear ${i}`,
            data: [
                i === 1 ? makeDataPoint(0.0, 0.0) : makeDataPoint(graphGearsInv[i - 1] / lastGearInv, graphGearsInv[i - 1] / graphGearsInv[i]),
                makeDataPoint(graphGearsInv[i] / lastGearInv, 1.0)
            ]
            // borderWidth: 3,
            // borderColor: "#3b9fff",
            // fill: false,
            // pointRadius: 0
        });
    }
    return ret;
}

// ================= Main logic =================


function run() {
    let cfg = {};
    let allGood = true;
    for (let [id, label, extractor, minimum, maximum, defaultValue] of configFields) {
        let inputElement = document.getElementById(id);
        let value = (extractor === extractBool) ? inputElement.checked : inputElement.value;
        value = extractor(value);
        if (isNaN(value) || value < minimum || value > maximum) {
            inputElement.classList.add("badInput");
            allGood = false;
            continue;
        }
        inputElement.classList.remove("badInput");
        cfg[id] = value;
    }

    let outputTable = document.getElementById("outputs_table");
    outputTable.innerHTML = "";
    outputTable.classList.add("invisible");

    if (!allGood) return;

    const defaultGearsTarget = calculateGearRatios(
        cfg.numGears,
        cfg.defaultFirstGear,
        cfg.defaultLastGear,
        cfg.sFactor
    );

    let outputFiles = {};
    let defaultGearsReal = {};
    let graphGearsInvReal = {};

    function addOutput(name, text) {
        outputFiles[name] = text;
    }

    let rangeLerpT = cfg.gearStepsOverlap ? 1.0 : 0.5;

    for (let g = 0; g < cfg.numGears; g++) {
        let defaultInv = 1.0 / defaultGearsTarget[g];
        let rangeStart = defaultInv;
        let rangeEnd = defaultInv;

        if (cfg.stepsPerGear >= 2) {
            rangeStart = lerp(defaultInv, 1.0 / (defaultGearsTarget[g - 1] || 1.0), rangeLerpT);
            rangeEnd = lerp(defaultInv, 1.0 / (defaultGearsTarget[g + 1] || 1.0), rangeLerpT);

            if (g === 0) {
                rangeStart = defaultInv - (rangeEnd - defaultInv);
            } else if (g === cfg.numGears - 1) {
                rangeEnd = defaultInv + (defaultInv - rangeStart);
            }

            let rangeStep = (rangeEnd - rangeStart) / (Math.max(cfg.stepsPerGear, 3) - 1);
            rangeStart += rangeStep * 0.5;
            rangeEnd -= rangeStep * 0.5;
        }

        let content = buildRealRatioSet(g + 1, cfg.stepsPerGear, rangeStart, rangeEnd, defaultInv, defaultGearsReal, graphGearsInvReal);

        // if duplicate ratios are detected the step count should be reduced
        if (content === null) {
            let inputElement = document.getElementById("stepsPerGear");
            inputElement.classList.add("badInput");
            drawBlankGraph();
            return;
        }

        addOutput(getFileName(g + 1), content);
    }

    let finalHalfRange = (cfg.stepsFinal - 1) * 0.5 * cfg.finalDriveSpeedChangeRatio;
    let finalStart = 1.0 / cfg.defaultFinalDrive * (1.0 - finalHalfRange);
    let finalEnd = 1.0 / cfg.defaultFinalDrive * (1.0 + finalHalfRange);
    let finalContent = buildRealRatioSet("final", cfg.stepsFinal, finalStart, finalEnd, 1.0 / cfg.defaultFinalDrive, defaultGearsReal, graphGearsInvReal);

    // if duplicate ratios are detected the step size should be reduced
    if (finalContent === null) {
        let inputElement = document.getElementById("finalDriveSpeedChangeRatio");
        inputElement.classList.add("badInput");
        return;
    }

    addOutput("final.rto", finalContent);

    let drivetrainIni = "[GEARS]\n";
    drivetrainIni += `COUNT=${cfg.numGears}\n`;
    drivetrainIni += `GEAR_R=-${round(findBestRatio(1.0 / (defaultGearsTarget[0] * 1.5)).ratio, 3)} ; Adjust as needed, default is -1.5*GEAR_1\n`;

    for (let g = 1; g <= cfg.numGears; g++) {
        drivetrainIni += `GEAR_${g}=${defaultGearsReal[g]}\n`;
    }

    drivetrainIni += `FINAL=${defaultGearsReal["final"]}\n`;

    addOutput("drivetrain.ini (partial)", drivetrainIni);

    let setupIni = "/////////////////////////////////////////////////////\n;GEARS\n/////////////////////////////////////////////////////\n\n";
    let sliderYPos = 0;
    for (let g = 1; g <= cfg.numGears; g++) {
        setupIni += `[GEAR_${g}]\nRATIOS=${getFileName(g)}\nNAME=${getSetupSliderName(g)}\nPOS_X=0\nPOS_Y=${sliderYPos++}\nHELP=HELP_REAR_GEAR\n\n`;
    }

    setupIni += `[FINAL_GEAR_RATIO]\nRATIOS=final.rto\nNAME=${getSetupSliderName("final")}\nPOS_X=0\nPOS_Y=${sliderYPos++}\nHELP=HELP_REAR_GEAR\n\n`;

    addOutput("setup.ini (partial)", setupIni);

    // adding output text areas

    function createOutputTableCell(value, title) {
        let tableCell = document.createElement("td");
        let textArea = document.createElement("textarea");
        textArea.readOnly = true;
        textArea.rows = 10;
        textArea.cols = 60;
        textArea.value = value;

        let label = document.createElement("h3");
        label.textContent = title;

        tableCell.appendChild(label);
        tableCell.appendChild(textArea);

        return tableCell;
    }

    const outputKeys = Object.keys(outputFiles);
    const outputsPerRow = 3;

    for (let i = 0; i < outputKeys.length; i += outputsPerRow) {
        let tableRow = document.createElement("tr");

        for (let j = i; j < Math.min(outputKeys.length, i + outputsPerRow); j++) {
            let name = outputKeys[j];
            let outputText = outputFiles[name];

            let tableCell = createOutputTableCell(outputText, name);
            tableRow.appendChild(tableCell);
        }

        outputTable.appendChild(tableRow);
    }

    if (outputKeys.length > 0) outputTable.classList.remove("invisible");

    // updating graph

    drawGraph(graphGearsInvReal, cfg.numGears);
}