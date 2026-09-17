import AdmZip from 'adm-zip';
import path from 'node:path';

export default function extractZip() {
  const zip = new AdmZip(path.join(import.meta.dirname, "../map-tiles.zip")); 
  zip.extractAllTo(path.join(import.meta.dirname, "../"), true);
  console.log("Folder extracted successfully!");
}
