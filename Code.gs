// =================================================================
// 1. KONFIGURASI GLOBAL
// =================================================================
// 🔴 GANTI 3 NILAI INI SESUAI MILIK ANDA:
const SHEET_ID = "1lAO4IwLbgP6hew3inMvzQo8W9d7K1NlNI39cTNzKPdE"; 
const PARENT_FOLDER_ID = "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA"; 
const SHEET_NAME = "Data Siswa"; // Harus PERSIS sama dengan nama tab di Google Sheets

// =================================================================
// 2. WEB SERVICE HANDLERS (doGet & doPost)
// =================================================================

/**
 * Handler untuk HTTP GET (Read operations)
 */
function doGet(e) {
  Logger.log("=== doGet START ===");
  Logger.log("Parameters: " + JSON.stringify(e.parameter));
  
  let result;
  
  try {
    const action = e.parameter ? e.parameter.action : null;
    Logger.log("Action: " + action);
    
    if (!action) {
      throw new Error("Parameter 'action' tidak ditemukan");
    }
    
    switch (action) {
      case "getSiswaList":
        Logger.log("Calling getSiswaList...");
        result = getSiswaList();
        break;
        
      case "getPreviewLink":
        Logger.log("Calling getPreviewLink...");
        const folderId = e.parameter.folderId;
        const fileType = e.parameter.fileType;
        
        if (!folderId) {
          throw new Error("Parameter 'folderId' tidak ditemukan");
        }
        if (!fileType) {
          throw new Error("Parameter 'fileType' tidak ditemukan");
        }
        
        result = getPreviewLink(folderId, fileType);
        break;
        
      default:
        throw new Error("Aksi GET tidak dikenali: " + action);
    }
    
    Logger.log("Result success: " + result.success);
    
  } catch (error) {
    Logger.log("=== doGet ERROR ===");
    Logger.log("Error: " + error.message);
    result = { 
      success: false, 
      message: error.message 
    };
  }
  
  Logger.log("=== doGet END ===");
  return createJsonResponse(result);
}

/**
 * Handler untuk HTTP POST (Write/Update/Delete operations)
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
    let data = null;
    
    // Parse data dari POST request
    if (e.postData && e.postData.contents) {
      Logger.log("Parsing from e.postData.contents");
      Logger.log("Content length: " + e.postData.length);
      
      try {
        data = JSON.parse(e.postData.contents);
        Logger.log("JSON parsed successfully");
      } catch (parseError) {
        Logger.log("JSON parse error: " + parseError.message);
        throw new Error("Data tidak valid (bukan JSON): " + parseError.message);
      }
    } else if (e.parameter) {
      Logger.log("Fallback to e.parameter");
      data = e.parameter;
    }
    
    if (!data) {
      throw new Error("Tidak ada data yang diterima dari request");
    }
    
    Logger.log("Action: " + data.action);
    
    // Route berdasarkan action
    switch (data.action) {
      case "uploadFile":
        Logger.log("Processing uploadFile...");
        result = uploadFileBase64(data);
        break;
        
      case "tambahSiswa":
        Logger.log("Processing tambahSiswa...");
        result = tambahSiswa(data.nama, data.kelas);
        break;
        
      case "hapusSiswa":
        Logger.log("Processing hapusSiswa...");
        result = hapusSiswa(data.rowIndex);
        break;
        
      default:
        throw new Error("Aksi tidak dikenali: " + data.action);
    }
    
  } catch (error) {
    Logger.log("=== doPost ERROR ===");
    Logger.log("Error: " + error.message);
    result = { 
      success: false, 
      message: error.message
    };
  }
  
  Logger.log("=== doPost END ===");
  return createJsonResponse(result);
}

/**
 * Helper untuk membuat JSON response
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================================================================
// 3. FUNGSI UPLOAD FILE
// =================================================================

/**
 * Upload file menggunakan Base64 encoding
 */
function uploadFileBase64(data) {
  try {
    Logger.log("=== uploadFileBase64 START ===");
    
    // Validasi data object
    if (!data || typeof data !== 'object') {
      throw new Error("Data upload tidak valid");
    }
    
    // Extract parameters
    const folderId = data.folderId || null;
    const siswaName = data.siswaName || null;
    const fileType = data.fileType || null;
    const fileData = data.fileData || null;
    
    Logger.log("folderId: " + (folderId || "NULL"));
    Logger.log("siswaName: " + (siswaName || "NULL"));
    Logger.log("fileType: " + (fileType || "NULL"));
    Logger.log("fileData length: " + (fileData ? fileData.length : "NULL"));
    
    // Validasi parameter
    let missing = [];
    if (!folderId || folderId.trim() === "") missing.push("Folder ID");
    if (!siswaName || siswaName.trim() === "") missing.push("Nama Siswa");
    if (!fileType || fileType.trim() === "") missing.push("Tipe File");
    if (!fileData || fileData.length === 0) missing.push("Data File PDF");
    
    if (missing.length > 0) {
      throw new Error("Parameter tidak lengkap: " + missing.join(", "));
    }
    
    // Buat nama file unik
    const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
    const sanitizedName = siswaName.replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = sanitizedName + "_" + fileType + "_" + timestamp + ".pdf";
    
    Logger.log("File name: " + fileName);
    
    // Decode Base64 dan buat Blob
    let decodedData;
    try {
      decodedData = Utilities.base64Decode(fileData);
      Logger.log("Base64 decoded OK");
    } catch (decodeError) {
      throw new Error("Gagal decode Base64: " + decodeError.message);
    }
    
    const blob = Utilities.newBlob(decodedData, 'application/pdf', fileName);
    Logger.log("Blob size: " + blob.getBytes().length + " bytes");
    
    // Upload ke Google Drive
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
      Logger.log("Folder: " + folder.getName());
    } catch (folderError) {
      throw new Error("Folder tidak ditemukan (ID: " + folderId + ")");
    }
    
    let file;
    try {
      file = folder.createFile(blob);
      Logger.log("File created: " + file.getId());
    } catch (createError) {
      throw new Error("Gagal buat file: " + createError.message);
    }
    
    Logger.log("=== uploadFileBase64 END ===");
    
    return {
      success: true,
      message: "File " + fileType + " berhasil diunggah: " + fileName,
      fileUrl: file.getUrl(),
      fileId: file.getId()
    };
    
  } catch (error) {
    Logger.log("=== uploadFileBase64 ERROR ===");
    Logger.log("Error: " + error.message);
    throw new Error("Upload gagal: " + error.message);
  }
}

// =================================================================
// 4. FUNGSI CRUD SISWA
// =================================================================

/**
 * Mengambil daftar siswa dari Google Sheet
 */
function getSiswaList() {
  try {
    Logger.log("=== getSiswaList START ===");
    Logger.log("SHEET_ID: " + SHEET_ID);
    Logger.log("SHEET_NAME: " + SHEET_NAME);
    
    // Buka spreadsheet
    let ss;
    try {
      ss = SpreadsheetApp.openById(SHEET_ID);
      Logger.log("Spreadsheet OK");
    } catch (ssError) {
      throw new Error("Tidak bisa buka spreadsheet ID: " + SHEET_ID);
    }
    
    // Buka sheet
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      const available = ss.getSheets().map(s => s.getName()).join(", ");
      throw new Error("Sheet '" + SHEET_NAME + "' tidak ada. Sheet tersedia: " + available);
    }
    
    Logger.log("Sheet OK: " + sheet.getName());
    
    const lastRow = sheet.getLastRow();
    Logger.log("Last row: " + lastRow);
    
    // Jika hanya header atau kosong
    if (lastRow < 2) {
      Logger.log("No data");
      return { 
        success: true, 
        data: [],
        total: 0
      };
    }
    
    // Ambil data
    const range = sheet.getRange(2, 1, lastRow - 1, 3);
    const values = range.getValues();
    Logger.log("Rows retrieved: " + values.length);
    
    // Map data
    const siswaList = values.map((row, index) => ({
      rowIndex: index + 2,
      nama: row[0] ? String(row[0]).trim() : "",
      kelas: row[1] ? String(row[1]).trim() : "",
      folderId: row[2] ? String(row[2]).trim() : ""
    }));
    
    Logger.log("Total siswa: " + siswaList.length);
    Logger.log("=== getSiswaList END ===");
    
    return { 
      success: true, 
      data: siswaList,
      total: siswaList.length
    };
    
  } catch (error) {
    Logger.log("=== getSiswaList ERROR ===");
    Logger.log("Error: " + error.message);
    return {
      success: false,
      message: "Gagal load siswa: " + error.message,
      data: []
    };
  }
}

/**
 * Menambahkan siswa baru
 */
function tambahSiswa(nama, kelas) {
  try {
    Logger.log("=== tambahSiswa START ===");
    Logger.log("Nama: " + nama + ", Kelas: " + kelas);
    
    if (!nama || nama.trim() === "") {
      throw new Error("Nama siswa wajib diisi");
    }
    if (!kelas || kelas.trim() === "") {
      throw new Error("Kelas wajib diisi");
    }
    
    // Buat folder di Drive
    const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const folderName = kelas + " - " + nama;
    const newFolder = parentFolder.createFolder(folderName);
    const newFolderId = newFolder.getId();
    
    Logger.log("Folder created: " + folderName);
    Logger.log("Folder ID: " + newFolderId);
    
    // Tambah ke Sheet
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    sheet.appendRow([nama, kelas, newFolderId]);
    
    Logger.log("=== tambahSiswa END ===");
    
    return {
      success: true,
      message: "Siswa " + nama + " berhasil ditambahkan",
      folderId: newFolderId
    };
    
  } catch (error) {
    Logger.log("=== tambahSiswa ERROR ===");
    Logger.log("Error: " + error.message);
    throw new Error("Gagal tambah siswa: " + error.message);
  }
}

/**
 * Menghapus siswa
 */
function hapusSiswa(rowIndex) {
  try {
    Logger.log("=== hapusSiswa START ===");
    Logger.log("Row: " + rowIndex);
    
    if (!rowIndex || rowIndex < 2) {
      throw new Error("Nomor baris tidak valid");
    }
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    const nama = sheet.getRange(rowIndex, 1).getValue();
    Logger.log("Deleting: " + nama);
    
    sheet.deleteRow(rowIndex);
    
    Logger.log("=== hapusSiswa END ===");
    
    return { 
      success: true, 
      message: "Data siswa berhasil dihapus" 
    };
    
  } catch (error) {
    Logger.log("=== hapusSiswa ERROR ===");
    Logger.log("Error: " + error.message);
    throw new Error("Gagal hapus siswa: " + error.message);
  }
}

// =================================================================
// 5. FUNGSI PREVIEW FILE
// =================================================================

/**
 * Mendapatkan link preview PDF terbaru
 */
function getPreviewLink(folderId, fileType) {
  try {
    Logger.log("=== getPreviewLink START ===");
    Logger.log("Folder ID: " + folderId);
    Logger.log("File Type: " + fileType);
    
    if (!folderId || folderId.trim() === "") {
      throw new Error("Folder ID kosong");
    }
    
    const folder = DriveApp.getFolderById(folderId);
    Logger.log("Folder: " + folder.getName());
    
    const files = folder.getFilesByType(MimeType.PDF);
    
    let latestFile = null;
    let latestTime = 0;
    const keyword = fileType.toUpperCase();
    
    let count = 0;
    while (files.hasNext()) {
      const file = files.next();
      count++;
      const fileName = file.getName().toUpperCase();
      
      if (fileName.includes(keyword)) {
        const time = file.getLastUpdated().getTime();
        if (time > latestTime) {
          latestTime = time;
          latestFile = file;
        }
      }
    }
    
    Logger.log("Total PDF: " + count);
    
    if (latestFile) {
      Logger.log("Found: " + latestFile.getName());
      Logger.log("=== getPreviewLink END ===");
      
      return {
        success: true,
        previewLink: "https://drive.google.com/file/d/" + latestFile.getId() + "/preview",
        downloadLink: latestFile.getUrl()
      };
    } else {
      Logger.log("No matching file");
      Logger.log("=== getPreviewLink END ===");
      
      return { 
        success: false, 
        message: "File " + fileType + " tidak ditemukan di folder" 
      };
    }
    
  } catch (error) {
    Logger.log("=== getPreviewLink ERROR ===");
    Logger.log("Error: " + error.message);
    return { 
      success: false, 
      message: "Error: " + error.message 
    };
  }
}