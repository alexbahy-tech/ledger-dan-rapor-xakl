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
  
  // Mengembalikan JSON response yang benar (tanpa setHeader)
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
  
  // Mengembalikan JSON response yang benar (tanpa setHeader)
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

  // Asumsi data dimulai dari baris 2 (setelah header)
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, data: [] };
  
  const range = sheet.getRange(2, 1, lastRow - 1, 3);
  const values = range.getValues();
  
  // Format data menjadi array of objects, menyertakan Row Index untuk Hapus
  const siswaList = values.map((row, index) => ({
    rowIndex: index + 2, // Baris dimulai dari 2 di Sheet (setelah header)
    nama: row[0], // NAMA_SISWA
    kelas: row[1], // KELAS
    folderId: row[2] // FOLDER_ID
  }));
  
  return { success: true, data: siswaList };
}

/**
 * Menambahkan siswa baru ke Sheet dan membuat folder di Drive
 */
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
  
  // Kolom: NAMA_SISWA, KELAS, FOLDER_ID
  sheet.appendRow([nama, kelas, newFolderId]);
  
  return { 
    success: true, 
    message: `Siswa ${nama} berhasil ditambahkan. Folder ID: ${newFolderId}` 
  };
}

/**
 * Menghapus data siswa dari Sheet berdasarkan Row Index
 */
function hapusSiswa(rowIndex) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  // Hapus baris dari Sheet
  sheet.deleteRow(rowIndex);
  
  return { success: true, message: "Data siswa berhasil dihapus dari Sheet." };
}

/**
 * Mendapatkan link preview PDF terbaru
 */
function getPreviewLink(folderId) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    
    // Cari semua file PDF di folder
    const files = folder.getFilesByType(MimeType.PDF);
    let latestFile = null;
    let latestTime = 0;
    
    // Iterasi untuk mencari file PDF terbaru (asumsi nama file tidak perlu difilter)
    while (files.hasNext()) {
      const file = files.next();
      if (file.getLastUpdated().getTime() > latestTime) {
        latestTime = file.getLastUpdated().getTime();
        latestFile = file;
      }
    }
    
    if (latestFile) {
      // Menggunakan link embed untuk preview di iframe
      return { 
        success: true, 
        // Mengganti 'view' dengan 'preview' untuk embed yang lebih baik di iframe
        link: latestFile.getUrl().replace("view", "preview") 
      };
    } else {
      return { success: false, message: "Tidak ada file PDF ditemukan di folder ini." };
    }
    
  } catch (error) {
    return { success: false, message: "Folder tidak ditemukan atau error: " + error.message };
  }
}