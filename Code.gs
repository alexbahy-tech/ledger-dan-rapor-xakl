// =================================================================
// 1. KONFIGURASI GLOBAL
// =================================================================
// 🔴 PENTING: GANTI DENGAN ID GOOGLE SHEET ANDA
const SHEET_ID = "1lAO4IwLbgP6hew3inMvzQo8W9d7K1NlNI39cTNzKPdE"; 
// 🔴 PENTING: GANTI DENGAN ID FOLDER INDUK YANG SUDAH TERKONFIRMASI
const PARENT_FOLDER_ID = "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA"; 
const SHEET_NAME = "Data Siswa";

// =================================================================
// 2. WEB SERVICE HANDLERS (doGet & doPost)
// =================================================================
/**
 * Fungsi utama untuk menangani semua permintaan HTTP POST
 */
function doPost(e) {
  Logger.log("=== MULAI doPost ===");
  
  // Validasi event object
  if (!e) {
    Logger.log("ERROR: Event object kosong");
    return createJsonResponse({ 
      success: false, 
      message: "Permintaan tidak valid. Akses Web App dari URL yang sudah di-deploy." 
    });
  }
  
  let result;
  
  try {
    // CEK APAKAH INI REQUEST UPLOAD FILE
    // Upload file menggunakan e.parameter untuk form-data multipart
    if (e.parameter && e.parameter.action === "uploadFile") {
      Logger.log("Deteksi: Request Upload File");
      Logger.log("Parameters: " + JSON.stringify(e.parameter));
      
      const folderId = e.parameter.folderId;
      const fileType = e.parameter.fileType;
      const siswaName = e.parameter.siswaName;
      
      // KUNCI PERBAIKAN: Mengambil file dari e.parameters (BUKAN e.parameter)
      // Untuk multipart/form-data, file ada di e.parameters dengan format array
      const fileBlob = e.parameters && e.parameters.file ? e.parameters.file[0] : null;
      
      Logger.log("Folder ID: " + folderId);
      Logger.log("File Type: " + fileType);
      Logger.log("Siswa Name: " + siswaName);
      Logger.log("File Blob exists: " + (fileBlob !== null));
      
      // Validasi parameter
      let missingParams = [];
      if (!folderId || folderId.trim() === "") missingParams.push("Folder ID");
      if (!fileType) missingParams.push("Tipe File");
      if (!siswaName) missingParams.push("Nama Siswa");
      if (!fileBlob) missingParams.push("File PDF");
      
      if (missingParams.length > 0) {
        throw new Error("Parameter upload hilang: " + missingParams.join(", "));
      }
      
      // Upload file ke Drive
      result = uploadFileToDrive(folderId, fileBlob, fileType, siswaName);
      
    } 
    // CEK APAKAH INI REQUEST CRUD (tambahSiswa, hapusSiswa)
    else if (e.postData && e.postData.contents) {
      Logger.log("Deteksi: Request CRUD (JSON)");
      const data = JSON.parse(e.postData.contents);
      Logger.log("Action: " + data.action);
      
      switch (data.action) {
        case "tambahSiswa":
          result = tambahSiswa(data.nama, data.kelas);
          break;
        case "hapusSiswa":
          result = hapusSiswa(data.rowIndex);
          break;
        default:
          result = { success: false, message: "Aksi tidak dikenali: " + data.action };
      }
    } 
    else {
      throw new Error("Format request tidak valid. Tidak ada parameter atau postData.");
    }
    
  } catch (error) {
    Logger.log("ERROR di doPost: " + error.message);
    Logger.log("Stack trace: " + error.stack);
    result = { success: false, message: error.message };
  }
  
  Logger.log("=== SELESAI doPost ===");
  return createJsonResponse(result);
}

/**
 * Fungsi untuk upload file ke Google Drive
 */
function uploadFileToDrive(folderId, fileBlob, fileType, siswaName) {
  try {
    // Buat nama file unik
    const timestamp = new Date().getTime();
    const sanitizedName = siswaName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = sanitizedName + "_" + fileType + "_" + timestamp + ".pdf";
    
    Logger.log("Nama file yang akan dibuat: " + fileName);
    
    // Ambil folder tujuan
    const folder = DriveApp.getFolderById(folderId);
    Logger.log("Folder ditemukan: " + folder.getName());
    
    // Buat file di Drive
    const file = folder.createFile(fileBlob);
    file.setName(fileName);
    
    Logger.log("File berhasil dibuat: " + file.getName());
    Logger.log("File ID: " + file.getId());
    
    return {
      success: true,
      message: "File " + fileType + " berhasil diunggah: " + fileName,
      fileLink: file.getUrl(),
      fileId: file.getId()
    };
    
  } catch (error) {
    Logger.log("ERROR saat upload file: " + error.message);
    throw new Error("Gagal upload file: " + error.message);
  }
}

/**
 * Fungsi utama untuk menangani permintaan HTTP GET
 */
function doGet(e) {
  Logger.log("=== MULAI doGet ===");
  
  let result;
  
  try {
    const action = e.parameter.action;
    Logger.log("Action: " + action);
    
    switch (action) {
      case "getSiswaList":
        result = getSiswaList();
        break;
      case "getPreviewLink":
        result = getPreviewLink(e.parameter.folderId, e.parameter.fileType);
        break;
      default:
        result = { success: false, message: "Aksi tidak dikenali: " + action };
    }
    
  } catch (error) {
    Logger.log("ERROR di doGet: " + error.message);
    result = { success: false, message: error.message };
  }
  
  Logger.log("=== SELESAI doGet ===");
  return createJsonResponse(result);
}

/**
 * Helper function untuk membuat JSON response
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================================================================
// 3. FUNGSI DATA SISWA (CRUD & Read)
// =================================================================

/**
 * Mengambil daftar siswa dari Google Sheet
 */
function getSiswaList() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error("Sheet '" + SHEET_NAME + "' tidak ditemukan.");
    }
    
    const lastRow = sheet.getLastRow();
    
    if (lastRow < 2) {
      return { success: true, data: [] };
    }
    
    const range = sheet.getRange(2, 1, lastRow - 1, 3);
    const values = range.getValues();
    
    const siswaList = values.map((row, index) => ({
      rowIndex: index + 2,
      nama: row[0] || "",
      kelas: row[1] || "",
      folderId: row[2] || ""
    }));
    
    return { success: true, data: siswaList };
    
  } catch (error) {
    Logger.log("ERROR getSiswaList: " + error.message);
    throw new Error("Gagal mengambil data siswa: " + error.message);
  }
}

/**
 * Menambahkan data siswa baru
 */
function tambahSiswa(nama, kelas) {
  try {
    if (!nama || !kelas) {
      throw new Error("Nama dan Kelas wajib diisi.");
    }
    
    // Buat folder baru di Drive
    const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const folderName = kelas + " - " + nama;
    const newFolder = parentFolder.createFolder(folderName);
    const newFolderId = newFolder.getId();
    
    Logger.log("Folder baru dibuat: " + folderName + " (ID: " + newFolderId + ")");
    
    // Tambahkan ke Sheet
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    sheet.appendRow([nama, kelas, newFolderId]);
    
    return {
      success: true,
      message: "Siswa " + nama + " berhasil ditambahkan. Folder: " + folderName,
      folderId: newFolderId
    };
    
  } catch (error) {
    Logger.log("ERROR tambahSiswa: " + error.message);
    throw new Error("Gagal menambah siswa: " + error.message);
  }
}

/**
 * Menghapus data siswa
 */
function hapusSiswa(rowIndex) {
  try {
    if (!rowIndex || rowIndex < 2) {
      throw new Error("Nomor baris tidak valid.");
    }
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    // Ambil nama siswa sebelum dihapus (untuk log)
    const nama = sheet.getRange(rowIndex, 1).getValue();
    
    sheet.deleteRow(rowIndex);
    
    Logger.log("Data siswa " + nama + " (baris " + rowIndex + ") berhasil dihapus");
    
    return { 
      success: true, 
      message: "Data siswa berhasil dihapus dari Sheet." 
    };
    
  } catch (error) {
    Logger.log("ERROR hapusSiswa: " + error.message);
    throw new Error("Gagal menghapus siswa: " + error.message);
  }
}

/**
 * Mendapatkan link preview PDF terbaru
 */
function getPreviewLink(folderId, fileType) {
  try {
    if (!folderId) {
      throw new Error("Folder ID tidak diberikan.");
    }
    
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFilesByType(MimeType.PDF);
    
    let latestFile = null;
    let latestTime = 0;
    const searchKeyword = fileType.toUpperCase();
    
    while (files.hasNext()) {
      const file = files.next();
      const fileName = file.getName().toUpperCase();
      
      if (fileName.includes(searchKeyword)) {
        const fileTime = file.getLastUpdated().getTime();
        if (fileTime > latestTime) {
          latestTime = fileTime;
          latestFile = file;
        }
      }
    }
    
    if (latestFile) {
      return {
        success: true,
        previewLink: "https://drive.google.com/file/d/" + latestFile.getId() + "/preview",
        downloadLink: latestFile.getUrl()
      };
    } else {
      return { 
        success: false, 
        message: "Tidak ada file PDF jenis " + fileType + " ditemukan di folder ini." 
      };
    }
    
  } catch (error) {
    Logger.log("ERROR getPreviewLink: " + error.message);
    return { 
      success: false, 
      message: "Folder tidak ditemukan atau error: " + error.message 
    };
  }
}