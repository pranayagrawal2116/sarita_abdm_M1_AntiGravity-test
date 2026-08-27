const fs = require('fs');
let code = fs.readFileSync('web/index.html', 'utf8');

const headClosingTag = '</head>';
const pdfScript = `
  <!-- PDF.js for Syncfusion PDF Viewer -->
  <script src="//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js"></script>
  <script type="text/javascript">
     pdfjsLib.GlobalWorkerOptions.workerSrc = "//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js";
  </script>
</head>`;

code = code.replace(headClosingTag, pdfScript);
fs.writeFileSync('web/index.html', code);
console.log("Patched index.html with pdf.js");
