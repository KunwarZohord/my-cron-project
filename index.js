const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const crypto = require("crypto");
require("dotenv").config();
// Configurations
const ZOHORefresh_token = process.env.ZOHO_REFRESH_TOKEN;
const ZOHORlient_id = process.env.ZOHO_CLIENT_ID;
const ZOHORlinet_secret = process.env.ZOHO_CLIENT_SECRET;
const ZOHORORKDRIVE_PARENT_ID = process.env.Sales_ZOHO_PARENT_ID;
const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const GRAPH_FOLDER_URLS = process.env.Sales_Share_POINT_URL;


// 1️⃣ Get Zoho Access Token
console.log("===== ENV DEBUG =====");
console.log("TENANT_ID:", process.env.TENANT_ID);
console.log("MS_CLIENT_ID:", process.env.MS_CLIENT_ID);
console.log("ZOHO_PARENT_ID:", process.env.Sales_ZOHO_PARENT_ID);
console.log("=====================");
async function ZohoGetAccessToken() {
//   const tokenUrl = "https://accounts.zoho.in/oauth/v2/token";

  const tokenUrl = `https://accounts.zoho.in/oauth/v2/token?refresh_token=${ZOHORefresh_token}&client_secret=${ZOHORlinet_secret}&grant_type=refresh_token&client_id=${ZOHORlient_id}`;


  const response = await axios.post(tokenUrl, null, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });


  return response.data.access_token;
}

// Get Sharepoint Access Token
async function getAccessToken() {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append("client_id", CLIENT_ID);
  params.append("client_secret", CLIENT_SECRET);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");

  const response = await axios.post(tokenUrl, params, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  return response.data.access_token;
}

async function fetchLast24HourFiles() {
  try {
    const accessToken = await getAccessToken();
    i=0;
//  for (const GRAPH_FOLDER_URL of GRAPH_FOLDER_URLS) {
    const response = await axios.get(GRAPH_FOLDER_URLS, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const files = response.data.value;
    
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentFiles = files.filter(file =>
      new Date(file.createdDateTime) >= last24Hours
    );

    console.log(`\nFound ${recentFiles.length} files from last 24 hours\n`);

    const ZohoaccessToken = await ZohoGetAccessToken();
    for (const file of recentFiles) {
      console.log("File Name:", file.name);
      console.log("Size:", file.size);
      console.log("Download URL:", file["@microsoft.graph.downloadUrl"]);
      console.log("-----------------------------------");
      const fileStream = await downloadFile(file["@microsoft.graph.downloadUrl"]);
      if(file.size > 250 * 1024 * 1024){
        console.log("File is larger than 250MB, using stream upload");
        await uploadLargeFileFromStream(file["@microsoft.graph.downloadUrl"], ZohoaccessToken, file.name);
      }
      else{        console.log("File is smaller than 250MB, using regular upload");
      const result = await uploadToWorkDrive(fileStream, ZohoaccessToken, file.name);
      }
      // console.log("Upload Result:", result);
    }
//   }
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

async function downloadFile(Sharepoint_DOWNLOAD_URL) {
  try {
    const response = await axios.get(Sharepoint_DOWNLOAD_URL, {
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return response.data;

  } catch (error) {
    throw new Error("Failed to download file: " +
      (error.response?.data || error.message));
  }
}
async function downloadFilemorethan250MB(downloadUrl) {
  try {

    // First make HEAD request to get file size
    const headResponse = await axios.head(downloadUrl);
    const fileSize = headResponse.headers["content-length"];

    if (!fileSize) {
      throw new Error("Unable to determine file size");
    }

    // Now get stream
    const response = await axios.get(downloadUrl, {
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return {
      stream: response.data,
      size: fileSize
    };

  } catch (error) {
    throw new Error("Download failed: " +
      (error.response?.data || error.message));
  }
}

async function uploadLargeFileFromStream(downloadUrl,accessToken, fileName) {

  try {

    const uploadId = crypto.randomUUID();

    // Get stream + size
    const { stream, size } = await downloadFilemorethan250MB(downloadUrl);

    const response = await axios.post(
      "https://upload.zoho.in/workdrive-api/v1/stream/upload",
      stream,
      {
        headers: {
          "Authorization": `Zoho-oauthtoken ${accessToken}`,
          "x-filename": fileName,
          "x-parent_id": ZOHORORKDRIVE_PARENT_ID,
          "upload-id": uploadId,
          "x-streammode": "1",
          "Content-Type": "application/octet-stream",
          "Content-Length": size
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 0
      }
    );

    console.log("✅ Upload Successful");
    console.log(response.data);

  } catch (error) {
    console.error("❌ Upload Failed");
    console.error(error.response?.data || error.message);
  }
}
async function uploadToWorkDrive(fileStream, accessToken, RecodingName) {
  try {
    const form = new FormData();

    // 🔥 Custom file name here
    const today = new Date().toISOString().split("T")[0];
    const customFileName = `zoho_recording_${today}.mp4`;

    form.append("content", fileStream, {
      filename: RecodingName,
      contentType: "video/mp4",
    });

    form.append("parent_id", ZOHORORKDRIVE_PARENT_ID);
    form.append("override-name-exist", "false");

    const response = await axios.post(
      "https://workdrive.zoho.in/api/v1/upload",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return response.data;

  } catch (error) {
    throw new Error("Upload failed: " +
      (error.response?.data || error.message));
  }
}

(async () => {
  await fetchLast24HourFiles();
})();
