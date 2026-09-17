import AdmZip from 'adm-zip';
import path from 'node:path';

export default function createZip(fileName = "map-tiles.zip") {
  const zip = new AdmZip();
  // Adds the local folder and preserves the folder structure inside the zip
  zip.addLocalFolder(path.join(import.meta.dirname, "../map-tiles"), "map-tiles"); 
  zip.writeZip(path.join(import.meta.dirname, `../${fileName}`));
  console.log("Folder zipped successfully!");
}
