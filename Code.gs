// =================================================================
// 1. KONFIGURASI GLOBAL
// =================================================================
const SHEET_ID = "1lAO4IwLbgP6hew3inMvzQo8W9d7K1NlNI39cTNzKPdE"; // 🔴 CONTOH: "1lAO4IwLbgP6hew3inMvzQo8W9d7K1NlNI39cTNzKPdE"
const PARENT_FOLDER_ID = "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA"; // 🔴 CONTOH: "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA"
const SHEET_NAME = "Data Siswa";
const MAX_ROWS_TO_LOAD = 500; // Batasan untuk efisiensi loading data
// =================================================================
// 2. WEB SERVICE HANDLERS (doGet & doPost)
// =================================================================

function doGet(e) {
  const action = e.parameter.action;
  let result;

  try {
    if (action === "getSiswaList") {
      result = { success: true, data: getSiswaList() };
    } else if (action === "getPreviewLink") {
      const folderId = e.parameter.folderId;
      const fileType = e.parameter.fileType;
      result = getPreviewLink(folderId, fileType);
    } else {
      return HtmlService.createTemplateFromFile('Index').evaluate()
        .setTitle('Pusat Data Ledger & Rapor')
        .setSandboxMode(HtmlService.SandboxMode.IFRAME);
    }
  } catch (error) {
    result = { success: false, message: error.message };
  }

  if (action) {
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  let result;

  try {
    const action = e.parameter.action;

    if (action === "uploadFile") {
      const folderId = e.parameter.folderId;
      const fileType = e.parameter.fileType; 
      const siswaName = e.parameter.siswaName;
      const fileNamePrefix = siswaName.replace(/ /g, '_') + "_" + fileType;
      const fileBlob = e.parameters.file;

      if (!folderId || folderId.trim() === "") throw new Error("Folder ID hilang. Data Siswa mungkin tidak lengkap.");
      if (!fileBlob || (Array.isArray(fileBlob) && fileBlob.length === 0)) throw new Error("File PDF tidak ditemukan atau kosong.");

      // Ambil objek Blob yang sebenarnya
      const uploadedBlob = Array.isArray(fileBlob) ? fileBlob[0] : fileBlob; 
      
      if (typeof uploadedBlob.setName !== 'function') {
           throw new Error("Objek file tidak valid. Pastikan file terpilih dan Apps Script di-deploy dengan otorisasi Drive yang benar.");
      }

      // 1. Set nama file lengkap dengan ekstensi PDF dan timestamp
      const finalFileName = `${fileNamePrefix}_${Date.now()}.pdf`;
      const namedBlob = uploadedBlob.setName(finalFileName);

      // 2. Simpan file ke Drive
      const folder = DriveApp.getFolderById(folderId);
      const file = folder.createFile(namedBlob); 

      result = {
        success: true,
        message: `File ${fileType} berhasil diunggah dengan nama: ${file.getName()}`,
        fileLink: file.getUrl()
      };

    } else if (action === "tambahSiswa") {
      const { nis, name } = e.parameter;
      result = tambahSiswa(nis, name);
      
    } else if (action === "hapusSiswa") {
      const { rowIndex } = e.parameter;
      result = hapusSiswa(parseInt(rowIndex));

    } else {
      throw new Error("Aksi tidak dikenal.");
    }

  } catch (error) {
    result = { success: false, message: "Error Server: " + error.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================================================================
// 3. UTILITY FUNCTIONS (Sheet & Drive Management)
// =================================================================

/**
 * Mengambil daftar siswa, membuat folder jika belum ada, dan mengupdate Sheet.
 * @returns {Array<Object>} Array objek siswa.
 */
function getSiswaList() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  // Ambil hanya data yang benar-benar berisi (hingga MAX_ROWS_TO_LOAD)
  const range = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), MAX_ROWS_TO_LOAD), sheet.getLastColumn());
  const data = range.getValues();
  if (data.length <= 1) return [];

  const headers = data.shift(); // Hapus header

  const siswaList = data.map((row, index) => {
    // Baris di Sheet (1-based), index di array (0-based)
    const rowIndex = index + 2; // +2 karena header dan array 0-based
    const nis = row[0] ? String(row[0]).trim() : '';
    const name = row[1] ? String(row[1]).trim() : '';
    let folderId = row[2] ? String(row[2]).trim() : '';

    if (!name || !nis) return null; // Skip baris kosong

    // Cek/Buat Folder ID jika kosong
    if (!folderId) {
      try {
        folderId = createFolderForSiswa(name);
        // Update Sheet jika Folder ID baru dibuat
        if (folderId) {
          sheet.getRange(`C${rowIndex}`).setValue(folderId);
        }
      } catch (e) {
        Logger.log(`Gagal membuat folder untuk ${name}: ${e.message}`);
        // Jika gagal, set folderId ke null agar tidak digunakan
        folderId = null; 
      }
    }
    
    return {
      nis: nis,
      name: name,
      folderId: folderId,
      rowIndex: rowIndex // Simpan index baris untuk operasi hapus
    };
  }).filter(siswa => siswa && siswa.folderId); // Filter data yang tidak lengkap atau gagal dibuat folder

  return siswaList;
}

/**
 * Menambahkan data siswa baru ke Google Sheet dan membuat folder.
 */
function tambahSiswa(nis, name) {
  if (!nis || !name) {
    return { success: false, message: "NIS dan Nama Siswa tidak boleh kosong." };
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const siswaNameClean = name.trim();
  const nisClean = String(nis).trim();

  // Cek duplikasi
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  if (data.some(row => String(row[0]).trim() === nisClean || String(row[1]).trim() === siswaNameClean)) {
    return { success: false, message: `Siswa dengan NIS ${nisClean} atau nama ${siswaNameClean} sudah ada.` };
  }

  // Buat folder Drive
  const folderId = createFolderForSiswa(siswaNameClean);
  
  if (!folderId) {
      throw new Error(`Gagal membuat folder Drive untuk ${siswaNameClean}. Cek ID folder induk.`);
  }

  // Tambahkan data ke Sheet (Kolom A: NIS, B: Nama, C: Folder ID)
  sheet.appendRow([nisClean, siswaNameClean, folderId]);

  return { 
    success: true, 
    message: `Siswa ${siswaNameClean} berhasil ditambahkan.`,
    data: { nis: nisClean, name: siswaNameClean, folderId: folderId, rowIndex: sheet.getLastRow() }
  };
}

/**
 * Menghapus baris siswa dari Google Sheet berdasarkan index baris.
 */
function hapusSiswa(rowIndex) {
  if (rowIndex < 2) { // Baris 1 adalah header
    return { success: false, message: "Index baris tidak valid untuk dihapus." };
  }
  
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const siswaName = sheet.getRange(rowIndex, 2).getValue();
  
  sheet.deleteRow(rowIndex);
  
  return { 
    success: true, 
    message: `Data siswa ${siswaName} (Baris ${rowIndex}) berhasil dihapus dari Sheet.`,
    rowIndex: rowIndex
  };
}

/**
 * Mencari file PDF terbaru (Ledger/Rapor) dalam folder siswa.
 */
function getPreviewLink(folderId, fileType) {
  // ... (Fungsi ini tetap sama dengan yang sudah di-sharing sebelumnya) ...
  try {
    const folder = DriveApp.getFolderById(folderId);
    const searchString = `title contains '${fileType}' and mimeType = 'application/pdf'`;
    const files = folder.searchFiles(searchString);

    let latestFile = null;
    let latestTime = 0;

    while (files.hasNext()) {
      const file = files.next();
      if (file.getDateCreated().getTime() > latestTime) {
        latestTime = file.getDateCreated().getTime();
        latestFile = file;
      }
    }

    if (latestFile) {
      return {
        success: true,
        previewLink: latestFile.getUrl(),
        downloadLink: latestFile.getDownloadUrl()
      };
    } else {
      return {
        success: false,
        message: `File ${fileType} tidak ditemukan dalam folder siswa ini.`,
        previewLink: "",
        downloadLink: ""
      };
    }
  } catch (error) {
    Logger.log("Error getPreviewLink: " + error.message);
    return {
      success: false,
      message: "Error Server: Gagal mencari file. Pastikan Folder ID Siswa valid.",
      previewLink: "",
      downloadLink: ""
    };
  }
}

/**
 * Membuat folder Drive baru untuk siswa jika belum ada.
 */
function createFolderForSiswa(siswaName) {
  // ... (Fungsi ini tetap sama dengan yang sudah di-sharing sebelumnya) ...
  try {
    const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const newFolderName = siswaName.trim();
    const existingFolders = parentFolder.getFoldersByName(newFolderName);

    if (existingFolders.hasNext()) {
      return existingFolders.next().getId();
    }

    const newFolder = parentFolder.createFolder(newFolderName);
    return newFolder.getId();
  } catch (e) {
    Logger.log("Gagal membuat/mendapatkan folder: " + e.message);
    return null; // Kembalikan null jika gagal
  }
}