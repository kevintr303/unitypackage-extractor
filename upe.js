document.addEventListener("DOMContentLoaded", () => {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("fileInput");
    const progressContainer = document.getElementById("progressContainer");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const filesContainer = document.getElementById("filesContainer");
    const downloadAllBtn = document.getElementById("downloadAllBtn");

    let extractedGroups = null;
    let unityPackageName = "";

    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFile);

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("highlight");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("highlight");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("highlight");
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFile();
        }
    });

    downloadAllBtn.addEventListener("click", zipAllFiles);

    /**
     * Update the progress bar display.
     * @param {number} value - Progress percentage (0 to 100)
     */
    function updateProgress(value) {
        progressBar.value = value;
        progressText.textContent = `${value}%`;
    }

    /**
     * Fade out the progress bar container.
     */
    function fadeOutProgressBar() {
        progressContainer.classList.add("fade-out");
        setTimeout(() => {
            progressContainer.style.display = "none";
            progressContainer.classList.remove("fade-out");
            updateProgress(0);
        }, 500);
    }

    /**
     * Handle file selection and extraction.
     */
    async function handleFile() {
        const file = fileInput.files[0];
        if (!file) return;
        unityPackageName = file.name;

        progressContainer.style.display = "block";
        updateProgress(0);
        downloadAllBtn.style.display = "none";
        filesContainer.innerHTML = "";

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                updateProgress(20);
                const arrayBuffer = e.target.result;
                const decompressed = pako.inflate(new Uint8Array(arrayBuffer));
                updateProgress(60);
                const tarEntries = await untar(decompressed.buffer);
                updateProgress(80);
                processExtractedFiles(tarEntries);
                updateProgress(100);
                setTimeout(fadeOutProgressBar, 1000);
            } catch (err) {
                console.error("Extraction failed:", err);
                alert("Failed to extract .unitypackage. Please ensure it's a valid file.");
                progressContainer.style.display = "none";
            }
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Group tar entries by asset using GUID folders and use the "pathname" file to determine
     * the actual asset path. Then, display a table with download links.
     *
     * @param {Array} tarEntries - Array of objects { name, buffer }.
     */
    function processExtractedFiles(tarEntries) {
        const groups = {};
        tarEntries.forEach((entry) => {
            // Expected format: GUID/filename
            const parts = entry.name.split("/");
            if (parts.length !== 2) return;
            const [guid, filename] = parts;
            if (!groups[guid]) groups[guid] = {};
            groups[guid][filename] = entry;
        });
        extractedGroups = groups;

        const table = document.createElement("table");
        table.id = "filesTable";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        ["Asset Path", "Asset File", "Meta File"].forEach((text) => {
            const th = document.createElement("th");
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        Object.keys(groups).forEach((guid) => {
            const group = groups[guid];
            if (!group["pathname"]) return;

            const assetPath = new TextDecoder().decode(group["pathname"].buffer).trim();
            const displayName = assetPath.split("/").pop();
            const row = document.createElement("tr");

            const pathCell = document.createElement("td");
            const pathDiv = document.createElement("div");
            pathDiv.classList.add("path-wrapper");
            pathDiv.textContent = assetPath;
            pathCell.appendChild(pathDiv);
            row.appendChild(pathCell);

            const assetCell = document.createElement("td");
            if (group["asset"]) {
                const assetLink = document.createElement("a");
                assetLink.href = URL.createObjectURL(new Blob([group["asset"].buffer]));
                assetLink.download = displayName;
                assetLink.textContent = "Download";
                assetCell.appendChild(assetLink);
            } else {
                assetCell.textContent = "N/A";
            }
            row.appendChild(assetCell);

            const metaCell = document.createElement("td");
            if (group["asset.meta"]) {
                const metaLink = document.createElement("a");
                metaLink.href = URL.createObjectURL(new Blob([group["asset.meta"].buffer]));
                metaLink.download = `${displayName}.meta`;
                metaLink.textContent = "Download";
                metaCell.appendChild(metaLink);
            } else {
                metaCell.textContent = "N/A";
            }
            row.appendChild(metaCell);

            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        filesContainer.innerHTML = "";
        filesContainer.appendChild(table);
        downloadAllBtn.style.display = "inline-block";
    }

    /**
     * Create a ZIP archive of all extracted assets (maintaining the folder structure)
     * and trigger its download. The ZIP filename matches the original Unity package name.
     */
    async function zipAllFiles() {
        if (!extractedGroups) return;

        const zip = new JSZip();
        Object.keys(extractedGroups).forEach((guid) => {
            const group = extractedGroups[guid];
            if (!group["pathname"]) return;
            const assetPath = new TextDecoder().decode(group["pathname"].buffer).trim();
            if (group["asset"]) {
                zip.file(assetPath, group["asset"].buffer);
            }
            if (group["asset.meta"]) {
                zip.file(assetPath + ".meta", group["asset.meta"].buffer);
            }
        });

        progressContainer.style.display = "block";
        updateProgress(0);

        try {
            const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
                updateProgress(Math.round(metadata.percent));
            });

            const zipFileName = unityPackageName
                ? unityPackageName.replace(/\.unitypackage$/i, "") + ".zip"
                : "UnityPackage.zip";

            const a = document.createElement("a");
            a.href = URL.createObjectURL(content);
            a.download = zipFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(fadeOutProgressBar, 1000);
        } catch (error) {
            console.error("Error generating ZIP:", error);
            alert("Failed to generate ZIP file.");
        }
    }
});
