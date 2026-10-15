const fs = require('fs');
const path = require('path');

const qrCodeLib = fs.readFileSync(path.join(__dirname, '../node_modules/qrcode-generator/dist/qrcode.js'), 'utf8');

const output = `/**
 * MetroQRGenerator - Scoped Pure-JavaScript QR Code Matrix & Vector SVG Generator
 * Compliant with ISO/IEC 18004 Standard for QR Code Generation.
 * Standalone implementation without DOM or external network dependencies.
 * Fully compatible with ServiceNow Rhino & Scoped Application Engine.
 */

var _mtts_qrcode = (function() {
${qrCodeLib}
  return (typeof qrcode !== 'undefined') ? qrcode : (typeof module !== 'undefined' && module.exports ? module.exports : null);
})();

var MetroQRGenerator = Class.create();
MetroQRGenerator.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts.MetroQRGenerator] ';
    },

    /**
     * Generates a complete standalone SVG XML string for the input text payload.
     * Adheres to ISO/IEC 18004 specification with Reed-Solomon error correction.
     * @param {String} text Payload text to encode
     * @param {Number} [size] Width/height in pixels (default 256)
     * @returns {String} Standalone XML SVG string
     */
    generateSVG: function(text, size) {
        size = size || 256;
        var qr = _mtts_qrcode(0, 'M');
        qr.addData(text);
        qr.make();

        var moduleCount = qr.getModuleCount();
        var margin = 4; // Standard quiet zone required by ISO 18004
        var totalModules = moduleCount + (margin * 2);
        var cellSize = size / totalModules;

        var svg = [];
        svg.push('<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">');
        svg.push('<rect width="100%" height="100%" fill="#ffffff"/>');
        svg.push('<path fill="#000000" d="');

        for (var r = 0; r < moduleCount; r++) {
            for (var c = 0; c < moduleCount; c++) {
                if (qr.isDark(r, c)) {
                    var x = ((c + margin) * cellSize).toFixed(2);
                    var y = ((r + margin) * cellSize).toFixed(2);
                    var w = cellSize.toFixed(2);
                    var h = cellSize.toFixed(2);
                    svg.push('M' + x + ',' + y + 'h' + w + 'v' + h + 'h-' + w + 'z ');
                }
            }
        }

        svg.push('"/>');
        svg.push('</svg>');

        return svg.join('');
    },

    type: 'MetroQRGenerator'
};
`;

fs.writeFileSync(path.join(__dirname, '../sn_source/sys_script_include/MetroQRGenerator.js'), output, 'utf8');
console.log('Successfully wrote MetroQRGenerator.js, size:', output.length);
