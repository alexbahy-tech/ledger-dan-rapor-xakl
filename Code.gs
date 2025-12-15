// =================================================================
// 1. KONFIGURASI GLOBAL
// =================================================================
const SHEET_ID = "1lAO4IwLbgP6hew3inMvzQo8W9d7K1NlNI39cTNzKPdE"; // 🔴 CONTOH: "1lAO4IwLbgP6hew3inMvzQo8W9d7K1NlNI39cTNzKPdE"
//  ✅  ID FOLDER INDUK YANG SUDAH TERKONFIRMASI (Folder 'Data Rapor Siswa')
const PARENT_FOLDER_ID = "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA"; // 🔴 CONTOH: "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA"
const SHEET_NAME = "Data Siswa";
// =================================================================
// 2. WEB SERVICE HANDLERS (doGet & doPost)
// =================================================================
/**
 * Fungsi utama untuk menangani semua permintaan HTTP GET dari Front-end (untuk operasi Baca/Load Data)
 */
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
      // Tampilkan UI utama (Index.html)
      return HtmlService.createTemplateFromFile('Index').evaluate()
        .setTitle('Pusat Data Ledger & Rapor')
        .setSandboxMode(HtmlService.SandboxMode.IFRAME);
    }
  } catch (error) {
    result = { success: false, message: error.message };
  }

  // Hanya kembalikan JSON jika ada aksi spesifik yang diminta (bukan load UI)
  if (action) {
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Fungsi utama untuk menangani semua permintaan HTTP POST dari Front-end (untuk operasi Tulis/Ubah/Upload)
 */
function doPost(e) {

  // >>> BARIS DIAGNOSTIK KRITIS (Logger.log) <<<
  Logger.log("--- START DEBUG ---");
  Logger.log("Parameters received: " + JSON.stringify(e.parameter));
  if (e.parameters.file) {
    const fileArray = Array.isArray(e.parameters.file) ? e.parameters.file : [e.parameters.file];
    Logger.log("File detected: " + (fileArray.length > 0) + ". Total parts: " + fileArray.length);
  } else {
    Logger.log("File NOT detected in e.parameters.");
  }
  Logger.log("--- END DEBUG ---");
  // >>> AKHIR BARIS DIAGNOSTIK <<<

  let result;

  try {
    const action = e.parameter.action;

    // --- OPERASI UPLOAD FILE (SUDAH DIOPTIMALKAN) ---
    if (action === "uploadFile") {
      const folderId = e.parameter.folderId;
      const fileType = e.parameter.fileType; // LEDGER atau RAPOR
      const siswaName = e.parameter.siswaName;
      // Nama file untuk filter: (NAMA_SISWA_LEDGER_TIMESTAMP.pdf)
      const fileNamePrefix = siswaName.replace(/ /g, '_') + "_" + fileType;
      const fileBlob = e.parameters.file;

      // >>> PENGECEKAN KESALAHAN UPLOAD (SERVER-SIDE CHECK) <<<
      let missingParam = [];
      if (!folderId || folderId.trim() === "") missingParam.push("Folder ID (Kolom C di Sheet kosong)");
      // Cek apakah file benar-benar ada
      if (!fileBlob || (Array.isArray(fileBlob) && fileBlob.length === 0)) missingParam.push("File PDF");

      if (missingParam.length > 0) {
        throw new Error("Parameter upload hilang: " + missingParam.join(" dan "));
      }
      // >>> AKHIR PENGECEKAN <<<

      // Ambil objek Blob yang sebenarnya (elemen pertama dari array, atau langsung objek jika bukan array)
      const uploadedBlob = Array.isArray(fileBlob) ? fileBlob[0] : fileBlob;

      // Pengecekan keamanan: memastikan variabel yang ditangani adalah objek Blob yang valid
      if (typeof uploadedBlob.setName !== 'function') {
           throw new Error("Objek file tidak valid. Pastikan file terpilih dan tidak kosong.");
      }

      // 1. Set nama file lengkap dengan ekstensi PDF dan timestamp untuk unik
      // Contoh: NAMA_SISWA_LEDGER_167888888888.pdf
      const finalFileName = `${fileNamePrefix}_${Date.now()}.pdf`;
      const namedBlob = uploadedBlob.setName(finalFileName);

      // 2. Simpan file ke Drive (menggunakan folderId siswa spesifik)
      const folder = DriveApp.getFolderById(folderId);
      const file = folder.createFile(namedBlob); // Gunakan Blob yang sudah diberi nama

      result = {
        success: true,
        message: `File ${fileType} berhasil diunggah dengan nama: ${file.getName()}`,
        fileLink: file.getUrl()
      };

    } else if (action === "tambahSiswa") {
      // Logika untuk menambah siswa (atau fungsi CRUD lainnya)
      // ... (Sesuaikan dengan kebutuhan Anda, jika ada)
      result = { success: false, message: "Aksi 'tambahSiswa' belum diimplementasikan." };
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
// 3. UTILITY FUNCTIONS
// =================================================================

/**
 * Mengambil daftar siswa dari Google Sheet.
 * @returns {Array<Object>} Array objek siswa.
 */
function getSiswaList() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift(); // Hapus header

  // Asumsi Kolom: A (NIS), B (Nama), C (Folder ID Drive)
  const siswaList = data.map(row => {
    // Memastikan Folder ID (Kolom C) tidak kosong
    const folderId = row[2] || createFolderForSiswa(row[1]); // Buat jika kosong

    // Update Sheet jika Folder ID baru dibuat
    if (folderId !== row[2]) {
      const rowIndex = data.indexOf(row) + 2; // +2 karena header dan array 0-based
      sheet.getRange(`C${rowIndex}`).setValue(folderId);
    }

    return {
      nis: row[0],
      name: row[1],
      folderId: folderId
    };
  }).filter(siswa => siswa.name && siswa.folderId); // Filter data yang tidak lengkap

  return siswaList;
}

/**
 * Membuat folder Drive baru untuk siswa jika belum ada.
 * @param {string} siswaName - Nama siswa.
 * @returns {string} ID Folder Drive yang baru dibuat.
 */
function createFolderForSiswa(siswaName) {
  try {
    const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const newFolderName = siswaName;
    const existingFolders = parentFolder.getFoldersByName(newFolderName);

    // Cek apakah folder sudah ada
    if (existingFolders.hasNext()) {
      const existingFolder = existingFolders.next();
      Logger.log(`Folder sudah ada untuk ${siswaName}: ${existingFolder.getId()}`);
      return existingFolder.getId();
    }

    // Jika belum ada, buat folder baru
    const newFolder = parentFolder.createFolder(newFolderName);
    Logger.log(`Folder baru dibuat untuk ${siswaName}: ${newFolder.getId()}`);
    return newFolder.getId();
  } catch (e) {
    Logger.log("Gagal membuat/mendapatkan folder: " + e.message);
    throw new Error("Gagal mengelola folder siswa. Cek PARENT_FOLDER_ID di Code.gs.");
  }
}

/**
 * Mencari file PDF terbaru (Ledger/Rapor) dalam folder siswa.
 * @param {string} folderId - ID folder siswa.
 * @param {string} fileType - LEDGER atau RAPOR.
 * @returns {Object} Link preview dan link download.
 */
function getPreviewLink(folderId, fileType) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    // Cari file dengan pola nama: *_{fileType}_*.pdf
    const searchString = `title contains '${fileType}' and mimeType = 'application/pdf'`;
    const files = folder.searchFiles(searchString);

    let latestFile = null;
    let latestTime = 0;

    // Iterasi untuk mencari file yang paling baru (diurutkan berdasarkan waktu dibuat)
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