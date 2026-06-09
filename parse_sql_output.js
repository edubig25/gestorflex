const fs = require('fs');

function parseSqlOutput(filePath, outPath) {
  if (!fs.existsSync(filePath)) {
    console.log(`Not found: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  
  let resultText = content;
  try {
    const obj = JSON.parse(content);
    if (obj.result) {
      resultText = obj.result;
    }
  } catch(e) {
    // maybe it's not a JSON object
  }
  
  const start = resultText.indexOf('[{');
  const end = resultText.lastIndexOf('}]');
  if (start === -1 || end === -1) {
    console.error('JSON array not found in ' + filePath);
    return;
  }

  const jsonStr = resultText.substring(start, end + 2);
  
  try {
    const parsed = JSON.parse(jsonStr);
    const actualArray = parsed[0].json_agg || [];
    fs.writeFileSync(outPath, JSON.stringify(actualArray, null, 2));
    console.log(`Saved ${actualArray.length} items to ${outPath}`);
  } catch(e) {
    console.error('Error parsing JSON from ' + filePath + ':', e.message);
  }
}

const clientesPath = 'C:/Users/eduar/.gemini/antigravity/brain/5b6c1ce1-c2fb-494f-be0a-4f2bcc87558f/.system_generated/steps/293/output.txt';
const planosPath = 'C:/Users/eduar/.gemini/antigravity/brain/5b6c1ce1-c2fb-494f-be0a-4f2bcc87558f/.system_generated/steps/296/output.txt';

parseSqlOutput(clientesPath, 'backup_clientes.json');
parseSqlOutput(planosPath, 'backup_planos.json');
