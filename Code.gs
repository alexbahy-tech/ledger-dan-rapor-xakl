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
  Logger.log("=== doPost START ===");
  
  if (!e) {
    return createJsonResponse({ 
      success: false, 
      message: "Event object kosong" 
    });
  }
  
  let result;
  
  try {
    // Parse JSON body
    if (e.postData && e.postData.contents) {
      const data = JSON.parse(e.postData.contents);
      Logger.log("Action received: " + data.action);
      
      switch (data.action) {
        case "uploadFile":
          result = uploadFileBase64(data);
          break;
        case "tambahSiswa":
          result = tambahSiswa(data.nama, data.kelas);
          break;
        case "hapusSiswa":
          result = hapusSiswa(data.rowIndex);
          break;
        default:
          throw new Error("Aksi tidak dikenali: " + data.action);
      }
    } else {
      throw new Error("Tidak ada data POST");
    }
    
  } catch (error) {
    Logger.log("ERROR doPost: " + error.message);
    Logger.log("Stack: " + error.stack);
    result = { success: false, message: error.message };
  }
  
  Logger.log("=== doPost END ===");
  return createJsonResponse(result);
}

/**
 * Fungsi utama untuk menangani semua permintaan HTTP GET
 */
function doGet(e) {
  Logger.log("=== doGet START ===");
  
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
        result = { success: false, message: "Aksi GET tidak dikenali: " + action };
    }
    
  } catch (error) {
    Logger.log("ERROR doGet: " + error.message);
    result = { success: false, message: error.message };
  }
  
  Logger.log("=== doGet END ===");
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
// 3. FUNGSI UPLOAD FILE (BASE64)
// =================================================================

/**
 * Upload file menggunakan Base64 encoding
 */
function uploadFileBase64(data) {
  try {
    Logger.log("=== uploadFileBase64 START ===");
    
    const folderId = data.folderId;
    const siswaName = data.siswaName;
    const fileType = data.fileType;
    const fileData = data.fileData;
    
    Logger.log("Folder ID: " + folderId);
    Logger.log("Siswa Name: " + siswaName);
    Logger.log("File Type: " + fileType);
    Logger.log("File Data length: " + (fileData ? fileData.length : 0));
    
    // Validasi parameter
    if (!folderId || folderId.trim() === "") {
      throw new Error("Folder ID kosong atau tidak valid");
    }
    if (!siswaName || siswaName.trim() === "") {
      throw new Error("Nama siswa kosong");
    }
    if (!fileType || fileType.trim() === "") {
      throw new Error("Tipe file kosong");
    }
    if (!fileData || fileData.length === 0) {
      throw new Error("Data file PDF kosong");
    }
    
    // Buat nama file unik
    const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
    const sanitizedName = siswaName.replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = sanitizedName + "_" + fileType + "_" + timestamp + ".pdf";
    
    Logger.log("File name: " + fileName);
    
    // Decode Base64 dan buat Blob
    const decodedData = Utilities.base64Decode(fileData);
    const blob = Utilities.newBlob(decodedData, 'application/pdf', fileName);
    
    Logger.log("Blob created, size: " + blob.getBytes().length + " bytes");
    
    // Upload ke Google Drive
    const folder = DriveApp.getFolderById(folderId);
    Logger.log("Folder found: " + folder.getName());
    
    const file = folder.createFile(blob);
    Logger.log("File created successfully!");
    Logger.log("File ID: " + file.getId());
    Logger.log("File URL: " + file.getUrl());
    
    Logger.log("=== uploadFileBase64 END ===");
    
    return {
      success: true,
      message: "File " + fileType + " berhasil diunggah: " + fileName,
      fileUrl: file.getUrl(),
      fileId: file.getId()
    };
    
  } catch (error) {
    Logger.log("ERROR uploadFileBase64: " + error.message);
    Logger.log("Stack: " + error.stack);
    throw new Error("Gagal upload file: " + error.message);
  }
}

// =================================================================
// 4. FUNGSI DATA SISWA (CRUD & Read)
// =================================================================

/**
 * Mengambil daftar siswa dari Google Sheet
 */
function getSiswaList() {
  try {
    Logger.log("=== getSiswaList START ===");
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error("Sheet dengan nama '" + SHEET_NAME + "' tidak ditemukan");
    }
    
    const lastRow = sheet.getLastRow();
    Logger.log("Last row: " + lastRow);
    
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
    
    Logger.log("Total siswa: " + siswaList.length);
    Logger.log("=== getSiswaList END ===");
    
    return { success: true, data: siswaList };
    
  } catch (error) {
    Logger.log("ERROR getSiswaList: " + error.message);
    throw new Error("Gagal mengambil data siswa: " + error.message);
  }
}

/**
 * Menambahkan data siswa baru ke Google Sheet dan membuat Folder di Drive
 */
function tambahSiswa(nama, kelas) {
  try {
    Logger.log("=== tambahSiswa START ===");
    Logger.log("Nama: " + nama);
    Logger.log("Kelas: " + kelas);
    
    if (!nama || nama.trim() === "") {
      throw new Error("Nama siswa wajib diisi");
    }
    if (!kelas || kelas.trim() === "") {
      throw new Error("Kelas wajib diisi");
    }
    
    // Buat folder baru di Google Drive
    const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const folderName = kelas + " - " + nama;
    const newFolder = parentFolder.createFolder(folderName);
    const newFolderId = newFolder.getId();
    
    Logger.log("Folder created: " + folderName);
    Logger.log("Folder ID: " + newFolderId);
    
    // Tambahkan data ke Google Sheet
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    sheet.appendRow([nama, kelas, newFolderId]);
    
    Logger.log("Data added to sheet");
    Logger.log("=== tambahSiswa END ===");
    
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
 * Menghapus data siswa dari Google Sheet berdasarkan nomor baris
 */
function hapusSiswa(rowIndex) {
  try {
    Logger.log("=== hapusSiswa START ===");
    Logger.log("Row index: " + rowIndex);
    
    if (!rowIndex || rowIndex < 2) {
      throw new Error("Nomor baris tidak valid");
    }
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    // Ambil nama siswa sebelum dihapus (untuk log)
    const nama = sheet.getRange(rowIndex, 1).getValue();
    Logger.log("Deleting: " + nama);
    
    sheet.deleteRow(rowIndex);
    
    Logger.log("Row deleted successfully");
    Logger.log("=== hapusSiswa END ===");
    
    return { 
      success: true, 
      message: "Data siswa berhasil dihapus dari Sheet" 
    };
    
  } catch (error) {
    Logger.log("ERROR hapusSiswa: " + error.message);
    throw new Error("Gagal menghapus siswa: " + error.message);
  }
}

/**
 * Mendapatkan link preview PDF terbaru berdasarkan fileType (Ledger/Rapor)
 */
function getPreviewLink(folderId, fileType) {
  try {
    Logger.log("=== getPreviewLink START ===");
    Logger.log("Folder ID: " + folderId);
    Logger.log("File Type: " + fileType);
    
    if (!folderId || folderId.trim() === "") {
      throw new Error("Folder ID tidak diberikan");
    }
    
    const folder = DriveApp.getFolderById(folderId);
    Logger.log("Folder found: " + folder.getName());
    
    const files = folder.getFilesByType(MimeType.PDF);
    
    let latestFile = null;
    let latestTime = 0;
    const searchKeyword = fileType.toUpperCase();
    
    let fileCount = 0;
    while (files.hasNext()) {
      const file = files.next();
      fileCount++;
      const fileName = file.getName().toUpperCase();
      
      if (fileName.includes(searchKeyword)) {
        const fileTime = file.getLastUpdated().getTime();
        Logger.log("Found matching file: " + file.getName() + " (updated: " + fileTime + ")");
        
        if (fileTime > latestTime) {
          latestTime = fileTime;
          latestFile = file;
        }
      }
    }
    
    Logger.log("Total PDF files in folder: " + fileCount);
    
    if (latestFile) {
      const previewLink = "https://drive.google.com/file/d/" + latestFile.getId() + "/preview";
      const downloadLink = latestFile.getUrl();
      
      Logger.log("Latest file found: " + latestFile.getName());
      Logger.log("Preview link: " + previewLink);
      Logger.log("=== getPreviewLink END ===");
      
      return {
        success: true,
        previewLink: previewLink,
        downloadLink: downloadLink
      };
    } else {
      Logger.log("No matching file found");
      Logger.log("=== getPreviewLink END ===");
      
      return { 
        success: false, 
        message: "Tidak ada file PDF jenis " + fileType + " ditemukan di folder ini" 
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