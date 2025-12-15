// =================================================================
// 1. KONFIGURASI GLOBAL
// =================================================================
const SHEET_ID = "1lAO4IwLbgP6hew3inMvzQo8W9d7K1NlNI39cTNzKPdE"; 

// ✅ ID FOLDER INDUK YANG SUDAH TERKONFIRMASI
const PARENT_FOLDER_ID = "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA"; 

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
      // Nama file mencakup tipe file untuk filter: (NAMA_SISWA_LEDGER_TIMESTAMP)
      const fileName = siswaName.replace(/ /g, '_') + "_" + fileType + "_" + Date.now(); 
      const fileBlob = e.parameters.file;
      
      // >>> PENGECEKAN KESALAHAN UPLOAD (SERVER-SIDE CHECK) <<<
      let missingParam = [];
      if (!folderId || folderId.trim() === "") missingParam.push("Folder ID (Kolom C di Sheet kosong)");
      // Cek File PDF dari sisi server
      if (!fileBlob) missingParam.push("File PDF"); 
      
      if (missingParam.length > 0) {
        throw new Error("Parameter upload hilang: " + missingParam.join(" dan "));
      }
      // >>> AKHIR PENGECEKAN <<<
      
      // Simpan file ke Drive (menggunakan folderId siswa spesifik)
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
        result = getPreviewLink(e.parameter.folderId, e.parameter.fileType); 
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

/**
 * Mengambil daftar siswa dari Google Sheet
 */
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
    folderId: row[2] // Nilai ini yang harus valid untuk upload
  }));
  
  return { success: true, data: siswaList };
}

function tambahSiswa(nama, kelas) {
  if (!nama || !kelas) {
    throw new Error("Nama dan Kelas Siswa wajib diisi.");
  }
  
  // PARENT_FOLDER_ID digunakan di sini untuk membuat folder baru
  const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const newFolder = parentFolder.createFolder(`${kelas} - ${nama}`);
  const newFolderId = newFolder.getId();
  
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
 * Mendapatkan link preview PDF terbaru berdasarkan fileType (Ledger/Rapor)
 */
function getPreviewLink(folderId, fileType) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    
    const files = folder.getFilesByType(MimeType.PDF);
    let latestFile = null;
    let latestTime = 0;
    
    const searchKeyword = fileType.toUpperCase(); 
    
    while (files.hasNext()) {
      const file = files.next();
      const fileName = file.getName().toUpperCase();
      
      if (fileName.includes(searchKeyword)) {
          if (file.getLastUpdated().getTime() > latestTime) {
              latestTime = file.getLastUpdated().getTime();
              latestFile = file;
          }
      }
    }
    
    if (latestFile) {
      return { 
        success: true, 
        previewLink: latestFile.getUrl().replace("view", "preview"),
        downloadLink: latestFile.getUrl()
      };
    } else {
      return { success: false, message: `Tidak ada file PDF jenis ${fileType} ditemukan di folder ini.` };
    }
    
  } catch (error) {
    return { success: false, message: "Folder tidak ditemukan atau error: " + error.message };
  }
}