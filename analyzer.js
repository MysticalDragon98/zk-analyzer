const fs = require('fs');
const { highlight, log, line } = require('termx');
const r1cs = fs.readFileSync('./output/main.r1cs');

log("Processing", highlight('./output/main.r1cs'));

const parse4Bytes = buf => (buf[3] << 24) | (buf[2] << 16) | (buf[1] << 8) | buf[0];
const parseBufferInBigInt = buf => {
    let num = 0n;
    
    for (let i=0;i<buf.length * 8;i+=8) {
        let bi = BigInt(i);
        
        num |= BigInt(buf[i/8]) << bi;
    }

    return num;
}

const hexify = (buf, minLength) => {
    
    if (typeof buf == 'number') {
        let num = buf.toString(16);
        if (num.length % 2 == 1) num = num.padStart(num.length + 1, "0");

        return hexify(Buffer.from(num, "hex"), minLength);
    }

    return "0x" + (!minLength? buf.toString("hex") : buf.toString("hex").padStart(minLength, "0"));
}
const magicNumber = r1cs.subarray(0, 4);
const version = parse4Bytes(r1cs.subarray(4, 8))
const sections = parse4Bytes(r1cs.subarray(8, 12))
let index = 12;
let sectionInfo = [];

for (let i=0;i<sections;i++) {
    let startIndex = index;
    const sectionType = parse4Bytes(r1cs.subarray(index, index += 4));
    const sectionSize = parse4Bytes(r1cs.subarray(index, index += 8));
    const sectionContent = r1cs.subarray(index, index += sectionSize);

    sectionInfo.push({ sectionType, sectionSize, sectionContent });
}

sectionInfo.sort((a, b) => a.sectionType - b.sectionType);

let headers;
for (const section of sectionInfo) {
    let { sectionName, sectionType, sectionSize, sectionContent } = section;
    let subindex = 0;

    switch (sectionType) {
        case 1:
            sectionName = "0x01 - Headers"

            const fieldSize = parse4Bytes(sectionContent.subarray(subindex, subindex += 4));
            const prime = sectionContent.subarray(subindex, subindex += fieldSize);
            const nWires = parse4Bytes(sectionContent.subarray(subindex, subindex += 4));
            const nPubOut = parse4Bytes(sectionContent.subarray(subindex, subindex += 4));
            const nPubIn = parse4Bytes(sectionContent.subarray(subindex, subindex += 4));
            const nPrivIn = parse4Bytes(sectionContent.subarray(subindex, subindex += 4));
            const nLabels = parse4Bytes(sectionContent.subarray(subindex, subindex += 8));
            const nConstrains = parse4Bytes(sectionContent.subarray(subindex, subindex += 4));

            headers = { fieldSize, prime, nWires, nPubOut, nPubIn, nPrivIn, nLabels, nConstrains };
            section.headers = { ...headers };
            delete section.headers.prime;
            break;
        case 2:
            sectionName = "0x02 - Constraints";
            const constrains = [];
            for (let c=0;c<headers.nConstrains;c++) {
                const linearCombinations = [];
                
                for (let lc=0;lc<3;lc++) {
                    const n = parse4Bytes(sectionContent.subarray(subindex, subindex += 4));
                    headers.totalN = (headers.totalN ?? 0) + n;
        
                    for (let i=0;i<n;i++) {
                        const wireId = parse4Bytes(sectionContent.subarray(subindex, subindex +=4));
                        const lcomb = sectionContent.subarray(subindex, subindex += headers.fieldSize)

                        linearCombinations.push({
                            wireId,
                            value: parseBufferInBigInt(lcomb),
                            lcomb: hexify(lcomb, headers.fieldSize * 2),
                            lcombRaw: lcomb
                        });
    
                        // console.log(lcomb, lcomb.length, wireId, totalLComb)
                    }
                    // console.table(linearCombinations)
                }

                linearCombinations.sort((a, b) => a.wireId - b.wireId);
                
                for (const lc of linearCombinations) {
                    let parsedValues = [];
                    const { lcomb, wireId, value, lcombRaw } = lc;

                    for (let j=0;j<headers.fieldSize;) {
                        if (value <= Number.MAX_SAFE_INTEGER) {
                            const lSlice = parse4Bytes(lcombRaw.slice(j, j += 4));

                            parsedValues.push(lSlice);
                        } else {
                            const primeSlice = headers.prime.slice(j, j+=4);
                            const lSlice = lcombRaw.slice(j - 4, j);
                            const primeNumber = parse4Bytes(primeSlice);
                            const lNumber = parse4Bytes(lSlice);

                            parsedValues.push(primeNumber - lNumber);
                        }
                        // parsedValues.push(value - headers.prime);
                        // Outputs are parsed normally
                        // Inputs are parsed as difference between headers.prime and outputs
                    }

                    lc.parsedValues = parsedValues.join(" ")
                }

                for (const lc of linearCombinations) {
                    delete lc.value;
                    delete lc.lcombRaw;
                }

                //? Should i sort this?
                // linearCombinations.sort((a, b) => a.wireId - b.wireId)

                constrains.push({ linearCombinations, subindex });
            }

            section.constrains = constrains;
            break;
        case 3:
            sectionName = "0x03 - Label IDs";
            
            const labels = [];
            while (subindex < headers.totalN) {
                labels.push("0x" + section.sectionContent.subarray(subindex, subindex += 8).toString("hex"))
            }

            section.labels = labels;
            break;
        case 4:
        case 5:
        default: delete section.sectionContent; continue;
    }

    section.sectionName = sectionName;
    delete section.sectionContent;
}

delete headers.prime;

console.table([{
    hasMagicNumber: magicNumber.join("-") == [0x72, 0x31, 0x63, 0x73].join("-"),
    version,
    sections,
    ...headers
}]);


fs.writeFileSync("./output/analyzer.json", JSON.stringify(sectionInfo, null, 2));

log("Analyzer output has been exported to", highlight("./output/analyzer.json"))