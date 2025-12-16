/**
 * SISTEM ARSIP KURIKULUM - BACKEND
 * Fitur: Upload, Monitoring, Tambah/Hapus Siswa
 */

// --- KONFIGURASI ---
var SS_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
// GANTI BAGIAN BAWAH INI DENGAN ID FOLDER GOOGLE DRIVE UTAMA ANDA
var PARENT_FOLDER_ID = "https://drive.google.com/drive/folders/16aw4C5qTwJmNZw_FQe1Vcnm-M1xqmjbk"; 
// -------------------

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action; 
    var ss = SpreadsheetApp.openById(SS_ID);
    var masterSheet = ss.getSheetByName("MasterData");
    
    // === 1. FITUR UPLOAD FILE ===
    if (action == "upload") {
      var namaSiswa = data.namaSiswa;
      var fileData = data.fileData; // Base64
      var fileName = data.fileName;
      var jenisFile = data.jenisDocs;
      
      var dataSiswa = masterSheet.getDataRange().getValues();
      var folderId = "";
      
      // Mencari ID Folder berdasarkan Nama Siswa (Kolom C / Index 2)
      for (var i = 1; i < dataSiswa.length; i++) {
        if (dataSiswa[i][2] == namaSiswa) { 
          folderId = dataSiswa[i][4]; // Ambil Folder ID (Kolom E / Index 4)
          break;
        }
      }
      
      if (folderId == "" || folderId == undefined) {
        return responseJSON("error", "Error: Folder ID siswa tidak ditemukan. Cek MasterData.");
      }

      var folder = DriveApp.getFolderById(folderId);
      var contentType = data.mimeType || "application/pdf";
      var decoded = Utilities.base64Decode(fileData.split(',')[1]);
      var blob = Utilities.newBlob(decoded, contentType, fileName);
      var file = folder.createFile(blob);
      
      // Share file agar bisa dipreview
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      // Catat di LogUpload
      var logSheet = ss.getSheetByName("LogUpload");
      logSheet.appendRow([new Date(), "Guru", namaSiswa, jenisFile, file.getUrl()]);
      
      return responseJSON("success", "File berhasil diupload & tersimpan!", file.getUrl());
    }

    // === 2. FITUR TAMBAH SISWA ===
    else if (action == "addSiswa") {
      var namaBaru = data.namaSiswa;
      var nisBaru = data.nis; // Bisa kosong

      // Cek apakah nama sudah ada (Cegah Duplikat)
      var dataCek = masterSheet.getDataRange().getValues();
      for(var i=0; i<dataCek.length; i++){
        if(dataCek[i][2] == namaBaru) return responseJSON("error", "Nama siswa sudah ada di database!");
      }

      // Buat Nama Folder: "Nama" atau "Nama - NIS"
      var folderName = nisBaru ? (namaBaru + " - " + nisBaru) : namaBaru;

      var parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
      var newFolder = parentFolder.createFolder(folderName);
      var newFolderId = newFolder.getId();
      
      // Set Permission Folder Siswa (Opsional, agar bisa dilihat publik linknya)
      newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      var nextNo = masterSheet.getLastRow(); // Nomor urut sederhana

      // Simpan ke MasterData: [No, NIS, Nama, Kelas, FolderID]
      masterSheet.appendRow([nextNo, nisBaru, namaBaru, "Siswa Baru", newFolderId]);
      
      return responseJSON("success", "Siswa berhasil ditambahkan & Folder dibuat otomatis!");
    }

    // === 3. FITUR HAPUS SISWA ===
    else if (action == "deleteSiswa") {
      var namaHapus = data.namaSiswa;
      var dataSiswa = masterSheet.getDataRange().getValues();
      var rowIndex = -1;

      for (var i = 1; i < dataSiswa.length; i++) {
        if (dataSiswa[i][2] == namaHapus) {
          rowIndex = i + 1; // Konversi index array ke nomor baris sheet
          break;
        }
      }

      if (rowIndex != -1) {
        masterSheet.deleteRow(rowIndex);
        return responseJSON("success", "Data siswa berhasil dihapus dari daftar.");
      } else {
        return responseJSON("error", "Data tidak ditemukan.");
      }
    }

  } catch (f) {
    return responseJSON("error", "Terjadi Kesalahan: " + f.toString());
  }
}

// Helper untuk format JSON respons
function responseJSON(status, msg, link) {
  return ContentService.createTextOutput(JSON.stringify({
    result: status, message: msg, link: link || ""
  })).setMimeType(ContentService.MimeType.JSON);
}

// === FUNGSI AMBIL DATA (GET) ===
function doGet(e) {
  var action = e.parameter.action;
  var ss = SpreadsheetApp.openById(SS_ID);
  
  // Ambil Data Monitoring (Gabungan Master + Log)
  if (action == "getDataMonitoring") {
    var masterSheet = ss.getSheetByName("MasterData");
    // Ambil semua data (Baris 2 s/d akhir, Kolom A s/d E)
    var masterData = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, 5).getValues(); 
    
    var logSheet = ss.getSheetByName("LogUpload");
    var logData = [];
    if (logSheet.getLastRow() > 1) {
      // Ambil Nama(C), Jenis(D), Link(E) dari Log
      logData = logSheet.getRange(2, 3, logSheet.getLastRow() - 1, 3).getValues(); 
    }
    
    // Mapping Data
    var result = masterData.map(function(row) {
      var namaSiswa = row[2]; // Kolom C
      var nisSiswa = row[1];  // Kolom B
      
      // Cari apakah siswa ini ada di LogUpload
      var entry = logData.find(r => r[0] === namaSiswa);
      
      return { 
        nis: nisSiswa,
        nama: namaSiswa,
        status: entry ? "Sudah" : "Belum",
        link: entry ? entry[2] : "#",
        jenis: entry ? entry[1] : "-"
      };
    });
    
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Default: Ambil List Nama Saja (Untuk Dropdown)
  var masterSheet = ss.getSheetByName("MasterData");
  var data = masterSheet.getRange(2, 3, masterSheet.getLastRow() - 1, 1).getValues();
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}