// =================================================================
// 1. KONFIGURASI GLOBAL
// =================================================================
const SHEET_ID = "1lAO4IwLbgP6hew3inMvzQo8W9d7K1NlNI39cTNzKPdE"; // Sheet ID Anda
// Ganti dengan ID folder induk Drive Anda (misalnya: "ID folder siswa")
const PARENT_FOLDER_ID = "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA"; 
// Nama sheet yang berisi data siswa
const SHEET_NAME = "Data Siswa"; 

// =================================================================
// 2. WEB SERVICE HANDLERS (doGet & doPost)
// =================================================================

/**
 * Fungsi utama untuk menangani semua permintaan HTTP POST dari Front-end (untuk operasi Tulis/Ubah/Upload)
 */
function doPost(e) {
  let result;
  
  try {
    const action = e.parameter.action;

    // --- OPERASI UPLOAD FILE ---
    if (action === "uploadFile") {
      const folderId = e.parameter.folderId;
      const fileType = e.parameter.fileType;
      const siswaName = e.parameter.siswaName;
      const fileName = siswaName + "_" + fileType + "_" + Date.now();
      const fileBlob = e.parameters.file;
      
      if (!folderId || !fileBlob) {
        throw new Error("Folder ID atau File tidak ditemukan.");
      }
      
      // Simpan file ke Drive
      const folder = DriveApp.getFolderById(folderId);
      const file = folder.createFile(fileBlob[0].setName(fileName + '.pdf'));
      
      result = { 
        success: true, 
        message: `File ${fileType} berhasil diunggah dengan nama: ${file.getName()}`,
        fileLink: file.getUrl() 
      };
      
    } else {
      // Ambil data JSON untuk CRUD
      const data = JSON.parse(e.postData.contents);
    
      switch (data.action) {
        case "tambahSiswa":
          result = tambahSiswa(data.nama, data.kelas);
          break;
        case "hapusSiswa":
          result = hapusSiswa(data.rowIndex);
          break;
        default:
          result = { success: false, message: "Aksi tidak dikenali." };
          break;
      }
    }
    
  } catch (error) {
    result = { success: false, message: error.message };
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Fungsi utama untuk menangani semua permintaan HTTP GET dari Front-end (untuk operasi Baca)
 */
function doGet(e) {
  let result;
  
  try {
    const action = e.parameter.action;
    
    switch (action) {
      case "getSiswaList":
        result = getSiswaList();
        break;
      case "getPreviewLink":
        result = getPreviewLink(e.parameter.folderId);
        break;
      default:
        result = { success: false, message: "Aksi tidak dikenali." };
        break;
    }
    
  } catch (error) {
    result = { success: false, message: error.message };
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================================================================
// 3. FUNGSI DATA SISWA (CRUD & Read)
// =================================================================

function getSiswaList() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    throw new Error(`Sheet dengan nama ${SHEET_NAME} tidak ditemukan.`);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, data: [] };
  
  const range = sheet.getRange(2, 1, lastRow - 1, 3);
  const values = range.getValues();
  
  const siswaList = values.map((row, index) => ({
    rowIndex: index + 2, 
    nama: row[0], 
    kelas: row[1], 
    folderId: row[2] 
  }));
  
  return { success: true, data: siswaList };
}

function tambahSiswa(nama, kelas) {
  if (!nama || !kelas) {
    throw new Error("Nama dan Kelas Siswa wajib diisi.");
  }
  
  // 1. Buat folder baru di Drive
  const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const newFolder = parentFolder.createFolder(`${kelas} - ${nama}`);
  const newFolderId = newFolder.getId();
  
  // 2. Tambahkan data ke Google Sheet
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  sheet.appendRow([nama, kelas, newFolderId]);
  
  return { 
    success: true, 
    message: `Siswa ${nama} berhasil ditambahkan. Folder ID: ${newFolderId}` 
  };
}

function hapusSiswa(rowIndex) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  sheet.deleteRow(rowIndex);
  
  return { success: true, message: "Data siswa berhasil dihapus dari Sheet." };
}

/**
 * Mendapatkan link preview PDF terbaru dan link download
 */
function getPreviewLink(folderId) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    
    const files = folder.getFilesByType(MimeType.PDF);
    let latestFile = null;
    let latestTime = 0;
    
    while (files.hasNext()) {
      const file = files.next();
      if (file.getLastUpdated().getTime() > latestTime) {
        latestTime = file.getLastUpdated().getTime();
        latestFile = file;
      }
    }
    
    if (latestFile) {
      // Pastikan file Drive yang diakses di-setting 'Anyone with the link can view'
      // Agar bisa di-preview/download oleh siapapun yang mengakses Web App
      return { 
        success: true, 
        // Link untuk iframe (embed view)
        previewLink: latestFile.getUrl().replace("view", "preview"),
        // Link Drive Asli (untuk download/print)
        downloadLink: latestFile.getUrl()
      };
    } else {
      return { success: false, message: "Tidak ada file PDF ditemukan di folder ini." };
    }
    
  } catch (error) {
    return { success: false, message: "Folder tidak ditemukan atau error: " + error.message };
  }
}