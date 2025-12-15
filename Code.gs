// =================================================================
// 1. KONFIGURASI GLOBAL
// =================================================================
// ID Spreadsheet sudah dikonfirmasi
const SHEET_ID = "1lAO4IwLbgP6hew3inMvzQo8W9d7K1NlNI39cTNzKPdE"; 
// ID Folder Induk (Rapor Semester Ganjil) sudah dikonfirmasi
const PARENT_FOLDER_ID = "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA"; 
const SHEET_NAME = "Data Siswa";
const MAX_ROWS_TO_LOAD = 500; 
// =================================================================
// 2. WEB SERVICE HANDLERS (doGet & doPost)
// =================================================================

function doGet(e) {
  // FIX: Mengatasi TypeError: Cannot read properties of undefined (reading 'parameter')
  const action = (e && e.parameter) ? e.parameter.action : undefined;
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
      if (!fileBlob || (Array.isArray(fileBlob) && fileBlob.length === 0)) {
         // FIX: Menggunakan throw Error untuk pesan yang lebih jelas
         throw new Error("File PDF tidak ditemukan atau kosong.");
      }

      const uploadedBlob = Array.isArray(fileBlob) ? fileBlob[0] : fileBlob; 
      
      if (typeof uploadedBlob.setName !== 'function') {
           throw new Error("Objek file tidak valid. Pastikan file terpilih dan Apps Script di-deploy dengan otorisasi Drive yang benar.");
      }

      const finalFileName = `${fileNamePrefix}_${Date.now()}.pdf`;
      const namedBlob = uploadedBlob.setName(finalFileName);

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
      const rowIndexRaw = e.parameter.rowIndex;
      const rowIndex = parseInt(rowIndexRaw); 
      
      // FIX: Validasi ketat untuk menghindari error getRange(null, number)
      if (isNaN(rowIndex) || rowIndex < 2) {
          throw new Error("Gagal menghapus: Index baris tidak valid atau data tidak ditemukan.");
      }
      result = hapusSiswa(rowIndex);

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

function getSiswaList() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet dengan nama "${SHEET_NAME}" tidak ditemukan.`); // Fail fast
    
  const range = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), MAX_ROWS_TO_LOAD), sheet.getLastColumn());
  const data = range.getValues();
  if (data.length <= 1) return [];

  const headers = data.shift(); 

  const siswaList = data.map((row, index) => {
    const rowIndex = index + 2; 
    const nis = row[0] ? String(row[0]).trim() : '';
    const name = row[1] ? String(row[1]).trim() : '';
    let folderId = row[2] ? String(row[2]).trim() : '';

    if (!name || !nis) return null; 

    // Auto-create folder ID jika belum ada
    if (!folderId) {
      try {
        folderId = createFolderForSiswa(name);
        if (folderId) {
          sheet.getRange(`C${rowIndex}`).setValue(folderId);
        }
      } catch (e) {
        folderId = null; 
      }
    }
    
    return {
      nis: nis,
      name: name,
      folderId: folderId,
      rowIndex: rowIndex 
    };
  }).filter(siswa => siswa && siswa.folderId); 

  return siswaList;
}

function tambahSiswa(nis, name) {
  if (!nis || !name) {
    return { success: false, message: "NIS dan Nama Siswa tidak boleh kosong." };
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet dengan nama "${SHEET_NAME}" tidak ditemukan.`); 
    
  const siswaNameClean = name.trim();
  const nisClean = String(nis).trim();

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  if (data.some(row => String(row[0]).trim() === nisClean || String(row[1]).trim() === siswaNameClean)) {
    return { success: false, message: `Siswa dengan NIS ${nisClean} atau nama ${siswaNameClean} sudah ada.` };
  }

  const folderId = createFolderForSiswa(siswaNameClean);
  
  if (!folderId) {
      throw new Error(`Gagal membuat folder Drive untuk ${siswaNameClean}. Cek ID folder induk.`);
  }

  sheet.appendRow([nisClean, siswaNameClean, folderId]);

  return { 
    success: true, 
    message: `Siswa ${siswaNameClean} berhasil ditambahkan.`,
    data: { nis: nisClean, name: siswaNameClean, folderId: folderId, rowIndex: sheet.getLastRow() }
  };
}

function hapusSiswa(rowIndex) {
  // Check ini mungkin sudah dilakukan di doPost, tapi sebagai safeguard
  if (rowIndex < 2) { 
    return { success: false, message: "Index baris tidak valid untuk dihapus." };
  }
  
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet dengan nama "${SHEET_NAME}" tidak ditemukan.`); 
    
  // Pastikan baris yang akan dihapus tidak kosong
  const siswaName = sheet.getRange(rowIndex, 2).getValue();
  if (!siswaName) {
      throw new Error(`Baris ${rowIndex} tidak memiliki data siswa untuk dihapus.`);
  }
  
  sheet.deleteRow(rowIndex);
  
  return { 
    success: true, 
    message: `Data siswa ${siswaName} (Baris ${rowIndex}) berhasil dihapus dari Sheet.`,
    rowIndex: rowIndex
  };
}

function getPreviewLink(folderId, fileType) {
  // FIX: Validasi folderId untuk mengatasi error "Invalid argument: id"
  if (!folderId || typeof folderId !== 'string' || folderId.trim() === "") {
      return {
        success: false,
        message: "Error Data: Folder ID siswa tidak valid atau kosong. Mohon periksa data sheet.",
        previewLink: "",
        downloadLink: ""
      };
  }
    
  try {
    const folder = DriveApp.getFolderById(folderId); // ID sudah terjamin valid
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
      message: "Error Server: Gagal mencari file. Pastikan Folder ID Siswa valid dan Anda punya izin.",
      previewLink: "",
      downloadLink: ""
    };
  }
}

function createFolderForSiswa(siswaName) {
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
    return null; 
  }
}