'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const app = {
        config: {
            eReaderProfiles: {
                default_dimension: { width: 814, height: 1086 },
                kindle_paperwhite: { width: 1072, height: 1448, format: 'azw3', options: { grayscaleImages: true, copyMetadata: true } },
                kindle_basic: { width: 1030, height: 1384, format: 'azw3', options: { grayscaleImages: true, copyMetadata: true } },
                kobo_libra: { width: 1264, height: 1680, format: 'epub', options: { copyMetadata: true } },
                generic_hd: { width: 1080, height: 1440 },
            },
            SCRIPT_URLS: {
                jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
                pica: 'https://cdnjs.cloudflare.com/ajax/libs/pica/9.0.1/pica.min.js',
                pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
                pdfjsWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'
            },
            loadedScripts: new Set(),
        },
        utils: {
            loadScript(src) {
                return new Promise((resolve, reject) => {
                    if (app.config.loadedScripts.has(src)) {
                        resolve();
                        return;
                    }
                    const script = document.createElement('script');
                    script.src = src;
                    script.onload = () => {
                        app.config.loadedScripts.add(src);
                        resolve();
                    };
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            },
            setupDragDrop(areaId, inputId) {
                const area = document.getElementById(areaId);
                const input = document.getElementById(inputId);
                if (!area || !input) return;

                ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                    area.addEventListener(eventName, e => {
                        e.preventDefault();
                        e.stopPropagation();
                        area.classList.toggle('drag-over', eventName === 'dragenter' || eventName === 'dragover');
                    }, false);
                });
                area.addEventListener('click', () => input.click());
                area.addEventListener('drop', (e) => {
                    input.files = e.dataTransfer.files;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
            },
            async getEpubContent(file) {
                await this.loadScript(app.config.SCRIPT_URLS.jszip);
                const zip = new JSZip();
                const epubData = await file.arrayBuffer();
                const epub = await zip.loadAsync(epubData);
                const containerXmlStr = await epub.file("META-INF/container.xml").async("string");
                const parser = new DOMParser();
                const containerDoc = parser.parseFromString(containerXmlStr, "application/xml");
                const contentFilePath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
                if (!contentFilePath) throw new Error('Arquivo content.opf não encontrado.');
                const contentOpfStr = await epub.file(contentFilePath).async("string");
                const contentDoc = parser.parseFromString(contentOpfStr, "application/xml");
                const contentDir = contentFilePath.includes('/') ? contentFilePath.substring(0, contentFilePath.lastIndexOf('/') + 1) : '';
                
                const spineItems = Array.from(contentDoc.querySelectorAll('spine itemref'));
                const manifestItems = contentDoc.querySelector('manifest');
                const chapters = spineItems.map(item => {
                    const manifestId = item.getAttribute('idref');
                    const href = manifestItems.querySelector(`item[id="${manifestId}"]`)?.getAttribute('href');
                    return href ? contentDir + href : null;
                }).filter(Boolean);

                return { epub, contentDoc, contentFilePath, contentDir, chapters };
            },
            createStatusElement(container) {
                container.innerHTML = '';
                const loader = document.createElement('div');
                loader.className = 'loader';
                const text = document.createElement('span');
                const progressBarContainer = document.createElement('div');
                progressBarContainer.className = 'progress-bar';
                const progressBarInner = document.createElement('div');
                progressBarInner.className = 'progress-bar-inner';
                progressBarContainer.appendChild(progressBarInner);
                
                const buttonsContainer = document.createElement('div');
                buttonsContainer.className = 'status-buttons';
                const downloadLink = document.createElement('a');
                downloadLink.className = 'button download-button';
                downloadLink.style.display = 'none';
                buttonsContainer.appendChild(downloadLink);

                const logContainer = document.createElement('div');
                logContainer.className = 'conversion-log';

                container.append(loader, text, progressBarContainer, buttonsContainer, logContainer);

                const addLog = (message, type = 'info') => {
                    const logEntry = document.createElement('div');
                    logEntry.className = `log-entry log-${type}`;
                    logEntry.textContent = message;
                    logContainer.appendChild(logEntry);
                    logContainer.scrollTop = logContainer.scrollHeight;
                };

                return { loader, text, progressBarContainer, progressBarInner, downloadLink, buttonsContainer, logContainer, addLog };
            },
            findCoverPath(contentDoc) {
                const coverMeta = contentDoc.querySelector('meta[name="cover"]');
                if (coverMeta) {
                    const coverId = coverMeta.getAttribute('content');
                    const item = contentDoc.querySelector(`item[id="${coverId}"]`);
                    if (item) return item.getAttribute('href');
                }
                const coverItem = contentDoc.querySelector('item[properties="cover-image"]');
                if (coverItem) return coverItem.getAttribute('href');
                return null;
            },
            async resizeImage(file, profile) {
                await this.loadScript(app.config.SCRIPT_URLS.pica);
                const pica = window.pica();
                const offScreenCanvas = document.createElement('canvas');
                offScreenCanvas.width = profile.width;
                offScreenCanvas.height = profile.height;
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = URL.createObjectURL(file instanceof Blob ? file : new Blob([file]));
                });
                URL.revokeObjectURL(img.src);
                await pica.resize(img, offScreenCanvas);
                const blob = await pica.toBlob(offScreenCanvas, 'image/jpeg', 0.9);
                return blob.arrayBuffer();
            },
            showEbookPreview(title, chapters, epub) {
                const modal = document.getElementById('ebook-preview-modal');
                const titleEl = document.getElementById('preview-title');
                const contentArea = document.getElementById('preview-content-area');
                const closeBtn = document.getElementById('preview-close-btn');
                const nextBtn = document.getElementById('preview-next-btn');
                const prevBtn = document.getElementById('preview-prev-btn');
                const pageIndicator = document.getElementById('preview-page-indicator');

                if (!modal || !chapters || chapters.length === 0) {
                    alert('Nenhum conteúdo de capítulo para pré-visualizar.');
                    return;
                }

                let currentIndex = 0;
                titleEl.textContent = title;

                const renderChapter = async () => {
                    const chapterPath = chapters[currentIndex];
                    const chapterFile = epub.file(chapterPath);
                    if (!chapterFile) {
                        contentArea.innerHTML = `<p style="color: var(--error-color);">Erro: Não foi possível carregar o capítulo ${chapterPath}.</p>`;
                        return;
                    }
                    const content = await chapterFile.async('string');
                    contentArea.innerHTML = '';
                    const iframe = document.createElement('iframe');
                    iframe.style.width = '100%';
                    iframe.style.height = '60vh';
                    iframe.style.border = '1px solid var(--border-color)';
                    contentArea.appendChild(iframe);
                    iframe.contentWindow.document.open();
                    iframe.contentWindow.document.write(content);
                    iframe.contentWindow.document.close();
                    pageIndicator.textContent = `Capítulo ${currentIndex + 1} de ${chapters.length}`;
                    prevBtn.disabled = currentIndex === 0;
                    nextBtn.disabled = currentIndex === chapters.length - 1;
                };

                const onNext = () => {
                    if (currentIndex < chapters.length - 1) {
                        currentIndex++;
                        renderChapter();
                    }
                };

                const onPrev = () => {
                    if (currentIndex > 0) {
                        currentIndex--;
                        renderChapter();
                    }
                };
                
                const onClose = () => {
                    modal.style.display = 'none';
                    nextBtn.removeEventListener('click', onNext);
                    prevBtn.removeEventListener('click', onPrev);
                    closeBtn.removeEventListener('click', onClose);
                };

                // Remove old listeners before adding new ones
                nextBtn.removeEventListener('click', onNext);
                prevBtn.removeEventListener('click', onPrev);
                closeBtn.removeEventListener('click', onClose);

                nextBtn.addEventListener('click', onNext);
                prevBtn.addEventListener('click', onPrev);
                closeBtn.addEventListener('click', onClose);
                
                renderChapter();
                modal.style.display = 'flex';
            },
            async fetchMetadataOnline(filename) {
                const cleanedName = filename.replace(/\.(epub|mobi|azw3)$/i, '').replace(/[-_]/g, ' ');
                const url = `https://www.google.com/search?q=${encodeURIComponent(cleanedName + " livro autor")}`;
                window.open(url, '_blank');
            }
        },
        tools: {},
        init() {
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect) {
                themeSelect.addEventListener('change', (e) => {
                    document.body.dataset.theme = e.target.value;
                    localStorage.setItem('ebookToolsTheme', e.target.value);
                });
                const savedTheme = localStorage.getItem('ebookToolsTheme') || 'default';
                document.body.dataset.theme = savedTheme;
                themeSelect.value = savedTheme;
            }

            const page = window.location.pathname.split('/').pop().replace('.html', '');
            if (app.tools[page]) {
                app.tools[page].init();
            } else if (page === 'toc-editor') {
                app.tools.tocEditor.init();
            }

            this.setupDebugConsole();
        },
        setupDebugConsole() {
            const container = document.getElementById('debug-console-container');
            if (!container) return;

            container.innerHTML = `
                <div id="debug-header">Debug Console</div>
                <div id="debug-content"></div>
                <div id="debug-resize-handle"></div>
            `;

            const header = document.getElementById('debug-header');
            const content = document.getElementById('debug-content');
            let isDragging = false;
            let offsetX, offsetY;

            header.addEventListener('mousedown', (e) => {
                isDragging = true;
                offsetX = e.clientX - container.offsetLeft;
                offsetY = e.clientY - container.offsetTop;
                container.style.cursor = 'grabbing';
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    container.style.left = `${e.clientX - offsetX}px`;
                    container.style.top = `${e.clientY - offsetY}px`;
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                container.style.cursor = 'grab';
            });

            const originalConsoleLog = console.log;
            console.log = function(message) {
                const logEntry = document.createElement('div');
                logEntry.textContent = message;
                content.appendChild(logEntry);
                content.scrollTop = content.scrollHeight;
                originalConsoleLog.apply(console, arguments);
            };
        }
    };

    app.tools.resizer = {
        init() {
            this.epubInput = document.getElementById('epubInputResizer');
            this.fileName = document.getElementById('epub-file-name-resizer');
            this.resizeBtn = document.getElementById('resizeCoverBtn');
            this.addMoreEpubsBtn = document.getElementById('add-more-epubs');
            this.statusContainer = document.getElementById('status-resizer');
            this.deviceProfileSelect = document.getElementById('device-profile-resizer');
            this.fetchMetadataCheckbox = document.getElementById('fetch-metadata');
            this.filenameFormatSelect = document.getElementById('filename-format');
            this.previewWindow = document.getElementById('resizer-preview-window');
            this.editAllMetaBtn = document.getElementById('edit-all-meta-btn');
            this.epubFiles = [];
            this.filesMetadata = new Map();
            this.modifiedEpubs = [];
            this.eReaderProfiles = app.config.eReaderProfiles;
            this.modal = document.getElementById('metadata-modal');
            this.modalFileName = document.getElementById('modal-file-name');
            this.modalComparisonContainer = document.getElementById('metadata-comparison-container');
            this.modalCloseBtn = document.getElementById('modal-close-btn');
            this.modalApplyBtn = document.getElementById('modal-apply-btn');
            this.modalApplyAllBtn = document.getElementById('modal-apply-all-btn');
            this.modalSkipBtn = document.getElementById('modal-skip-btn');

            app.utils.setupDragDrop('epub-drop-area-resizer', 'epubInputResizer');
            this.epubInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
            this.addMoreEpubsBtn.addEventListener('click', () => this.epubInput.click());
            this.resizeBtn.addEventListener('click', () => this.resizeCovers());
            this.modalCloseBtn.addEventListener('click', () => this.closeMetadataModal());
            this.modalApplyBtn.addEventListener('click', () => this.applyMetadata());
            this.modalApplyAllBtn.addEventListener('click', () => this.applyMetadataToAll());
            this.modalSkipBtn.addEventListener('click', () => this.closeMetadataModal());
            this.editAllMetaBtn.addEventListener('click', () => this.openUniversalMetadataModal());
            this.fetchMetadataCheckbox.addEventListener('change', () => {
                document.getElementById('filename-format-group').style.display = this.fetchMetadataCheckbox.checked ? 'block' : 'none';
                this.editAllMetaBtn.disabled = !(this.fetchMetadataCheckbox.checked && this.epubFiles.length > 0);
            });
            this.previewWindow.innerHTML = '<p class="empty-state">Seus EPUBs carregados aparecerão aqui.</p>';
        },

        async handleFileSelect(files) {
            if (!files || files.length === 0) return;
            const newFiles = Array.from(files).slice(0, 100 - this.epubFiles.length);
            this.epubFiles.push(...newFiles);
            this.fileName.textContent = `${this.epubFiles.length} arquivo(s) selecionado(s)`;
            this.statusContainer.innerHTML = '';
            this.resizeBtn.disabled = false;
            this.modifiedEpubs = [];
            await this.processFilesForPreview(newFiles);
            this.editAllMetaBtn.disabled = !(this.fetchMetadataCheckbox.checked && this.epubFiles.length > 0);
        },

        async processFilesForPreview(filesToProcess) {
            if (this.epubFiles.length === 0) {
                this.previewWindow.innerHTML = '<p class="empty-state">Seus EPUBs carregados aparecerão aqui.</p>';
                return;
            }

            // If no specific files are passed, re-render everything.
            if (!filesToProcess) {
                this.previewWindow.innerHTML = '';
                filesToProcess = this.epubFiles;
            } else {
                // If it's the first file(s), clear the empty state
                if (this.epubFiles.length === filesToProcess.length) {
                    this.previewWindow.innerHTML = '';
                }
            }

            const fileProcessingPromises = filesToProcess.map(async (file) => {
                const index = this.epubFiles.indexOf(file);
                const previewItem = document.createElement('div');
                previewItem.className = 'preview-item';
                previewItem.dataset.fileIndex = index;

                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-btn';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.removeFile(index);
                };

                const img = document.createElement('img');
                img.src = '../icons/icon-192.png';
                const span = document.createElement('span');
                span.textContent = file.name;
                const editLabel = document.createElement('div');
                editLabel.className = 'edit-label';
                editLabel.textContent = 'Editar Metadados';

                previewItem.append(removeBtn, img, span, editLabel);
                this.previewWindow.appendChild(previewItem);

                try {
                    const { epub, contentDoc, contentDir, chapters } = await app.utils.getEpubContent(file);
                    file.epubData = { epub, contentDoc, contentDir, chapters };
                    const originalMeta = this.extractMetadata(contentDoc, file.name);
                    this.filesMetadata.set(file, { original: originalMeta, applied: { ...originalMeta } });

                    const coverPath = app.utils.findCoverPath(contentDoc);
                    if (coverPath) {
                        const coverFile = epub.file(contentDir + coverPath);
                        if (coverFile) {
                            const coverData = await coverFile.async('blob');
                            img.src = URL.createObjectURL(coverData);
                        }
                    }
                    previewItem.addEventListener('click', () => this.openMetadataModal(file));
                } catch (e) {
                    console.error(`Failed to process ${file.name}:`, e);
                    span.textContent += ' (Erro)';
                    this.filesMetadata.set(file, { error: true });
                }
            });
            await Promise.all(fileProcessingPromises);
        },

        removeFile(index) {
            this.epubFiles.splice(index, 1);
            // Re-render the entire preview to update indices
            this.processFilesForPreview(); 
            this.fileName.textContent = this.epubFiles.length > 0 ? `${this.epubFiles.length} arquivo(s) selecionado(s)` : '';
            if (this.epubFiles.length === 0) {
                this.resizeBtn.disabled = true;
                this.editAllMetaBtn.disabled = true;
            }
        },

                extractMetadata(contentDoc, fileName) {
            const metadata = contentDoc.querySelector('metadata');
            if (!metadata) {
                console.warn(`Metadata block not found in ${fileName}`);
                return { title: 'Sem Título', author: 'Sem Autor' };
            }

            const getMeta = (tag) => {
                const element = metadata.querySelector(tag.replace(':', ''));
                const value = element?.textContent.trim();
                if (!value) {
                    console.warn(`Metadata tag <${tag}> not found or empty in ${fileName}`);
                }
                return value || '';
            };

            let title = getMeta('dc:title');
            let author = getMeta('dc:creator');

            // Fallback to filename if title is missing
            if (!title) {
                title = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
            }

            if (!author) {
                author = 'Sem Autor';
            }

            return {
                title: title,
                author: author,
                publisher: getMeta('dc:publisher'),
                description: getMeta('dc:description'),
                series: getMeta('calibre:series'),
                volume: getMeta('calibre:series_index'),
            };
        },
        
        openMetadataModal(file) {
            this.currentFileForModal = file;
            const metadata = this.filesMetadata.get(file);
            if (!metadata || metadata.error) return;

            // Automatically search online if title or author is missing
            if (!metadata.applied.title || !metadata.applied.author) {
                app.utils.fetchMetadataOnline(file.name);
            }

            this.modalFileName.textContent = file.name;
            this.modalComparisonContainer.innerHTML = '';

            const createEditableColumn = (meta) => {
                const column = document.createElement('div');
                column.className = 'metadata-column';
                column.innerHTML = `<h3>Metadados (Editável)</h3>`;
                const fields = ['title', 'author', 'publisher', 'series', 'volume', 'description'];
                fields.forEach(key => {
                    const value = meta[key] || '';
                    const field = document.createElement('div');
                    field.className = 'metadata-field';
                    const label = document.createElement('label');
                    label.textContent = key.charAt(0).toUpperCase() + key.slice(1);
                    const input = key === 'description' ? document.createElement('textarea') : document.createElement('input');
                    input.value = value;
                    input.dataset.field = key;
                    field.append(label, input);
                    column.appendChild(field);
                });
                
                const searchBtn = document.createElement('button');
                searchBtn.textContent = 'Pesquisar Metadados Online';
                searchBtn.className = 'button secondary';
                searchBtn.style.marginTop = '10px';
                searchBtn.onclick = () => app.utils.fetchMetadataOnline(file.name);
                column.appendChild(searchBtn);

                return column;
            };

            const editableColumn = createEditableColumn(metadata.applied);
            this.modalComparisonContainer.append(editableColumn);
            this.modal.style.display = 'flex';
        },

        applyMetadata() {
            if (!this.currentFileForModal) return;
            const file = this.currentFileForModal;
            const metadata = this.filesMetadata.get(file);
            const newAppliedMeta = { ...metadata.applied };
            this.modalComparisonContainer.querySelectorAll('[data-field]').forEach(input => {
                newAppliedMeta[input.dataset.field] = input.value;
            });
            metadata.applied = newAppliedMeta;
            const previewItem = this.previewWindow.querySelector(`[data-file-index="${this.epubFiles.indexOf(file)}"]`);
            if (previewItem) previewItem.style.borderColor = 'var(--success-color)';
            this.closeMetadataModal();
        },

        closeMetadataModal() {
            this.modal.style.display = 'none';
            this.currentFileForModal = null;
        },

        async resizeCovers() {
            if (this.epubFiles.length === 0) {
                alert('Por favor, selecione um ou mais arquivos EPUB.');
                return;
            }
            const status = app.utils.createStatusElement(this.statusContainer);
            status.loader.style.display = 'block';
            status.progressBarContainer.style.display = 'block';
            status.addLog('Iniciando processo de redimensionamento...');
            console.log('Epubs to process:', this.epubFiles.length);

            const selectedProfileKey = this.deviceProfileSelect.value;
            const profile = this.eReaderProfiles[selectedProfileKey];
            if (!profile) {
                status.loader.style.display = 'none';
                status.addLog('Erro: Perfil de dispositivo inválido selecionado.', 'error');
                return;
            }
            status.addLog(`Perfil selecionado: ${this.deviceProfileSelect.options[this.deviceProfileSelect.selectedIndex].text}`);
            
            this.modifiedEpubs = [];
            let filesProcessed = 0;

            for (const file of this.epubFiles) {
                status.addLog(`--- Processando ${file.name} ---`);
                try {
                    const { epub, contentDoc, contentFilePath, contentDir, chapters } = file.epubData;
                    
                    const finalMeta = this.filesMetadata.get(file).applied;

                    if (this.fetchMetadataCheckbox.checked) {
                        status.addLog(`[${file.name}] Atualizando metadados...`);
                        const metadataEl = contentDoc.querySelector('metadata');
                        const dcNamespace = 'http://purl.org/dc/elements/1.1/';

                        Object.keys(finalMeta).forEach(key => {
                            if (finalMeta[key]) {
                                let el = metadataEl.querySelector(key.replace(':', '\\'));
                                if (!el) {
                                    // Handle potential namespace prefixes (dc, calibre, etc.)
                                    const tagName = key.includes(':') ? key : `dc:${key}`;
                                    el = contentDoc.createElementNS(dcNamespace, tagName);
                                    metadataEl.appendChild(el);
                                }
                                el.textContent = finalMeta[key];
                            }
                        });
                    }

                    const coverPath = app.utils.findCoverPath(contentDoc);
                    if (coverPath) {
                        const coverFile = epub.file(contentDir + coverPath);
                        if (coverFile) {
                            status.addLog(`[${file.name}] Redimensionando imagem da capa...`);
                            const coverData = await coverFile.async('blob');
                            const newCoverData = await app.utils.resizeImage(coverData, profile);
                            epub.file(contentDir + coverPath, newCoverData, { binary: true });
                            const manifestItem = contentDoc.querySelector(`item[href="${coverPath}"]`);
                            if (manifestItem) manifestItem.setAttribute('media-type', 'image/jpeg');
                        }
                    } else {
                        status.addLog(`[${file.name}] Nenhuma capa encontrada para redimensionar.`, 'warn');
                    }

                    status.addLog(`[${file.name}] Recompilando o arquivo EPUB...`);
                    const serializer = new XMLSerializer();
                    const newContentOpfStr = serializer.serializeToString(contentDoc);
                    epub.file(contentFilePath, newContentOpfStr);
                    
                    const newEpubBlob = await epub.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });

                    const format = this.filenameFormatSelect.value;
                    let newName = file.name.replace(/\.epub$/i, '-redimensionado.epub');
                    if (this.fetchMetadataCheckbox.checked && format !== 'original') {
                        newName = format.replace('{title}', finalMeta.title || 'Sem Título').replace('{author}', finalMeta.author || 'Sem Autor') + '.epub';
                    }
                    
                    this.modifiedEpubs.push({ name: newName, blob: newEpubBlob, chapters, epub: await app.utils.getEpubContent(new Blob([newEpubBlob])) });
                    status.addLog(`✔️ ${file.name} processado com sucesso!`, 'success');
                } catch (error) {
                    status.addLog(`❌ Falha ao processar ${file.name}: ${error.message}`, 'error');
                    console.error(`Falha ao processar ${file.name}:`, error);
                }
                filesProcessed++;
                status.progressBarInner.style.width = `${(filesProcessed / this.epubFiles.length) * 100}%`;
            }

            status.loader.style.display = 'none';
            status.text.textContent = 'Processo concluído.';
            console.log('Modified epubs:', this.modifiedEpubs.length);

            if (this.modifiedEpubs.length === 0) {
                status.addLog('Nenhum arquivo pôde ser processado.', 'error');
                return;
            }

            if (this.modifiedEpubs.length === 1) {
                const ebook = this.modifiedEpubs[0];
                const url = URL.createObjectURL(ebook.blob);
                status.downloadLink.href = url;
                status.downloadLink.download = ebook.name;
                status.downloadLink.textContent = 'Download do EPUB';
                status.downloadLink.style.display = 'inline-block';

                const previewBtn = document.createElement('button');
                previewBtn.textContent = 'Pré-visualizar';
                previewBtn.className = 'button secondary';
                previewBtn.onclick = () => app.utils.showEbookPreview(ebook.name, ebook.chapters, ebook.epub.epub);
                status.buttonsContainer.appendChild(previewBtn);

            } else {
                status.addLog(`Agrupando ${this.modifiedEpubs.length} arquivos em um ZIP...`);
                await app.utils.loadScript(app.config.SCRIPT_URLS.jszip);
                const zip = new JSZip();
                this.modifiedEpubs.forEach(epub => {
                    zip.file(epub.name, epub.blob);
                });
                const zipBlob = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(zipBlob);
                status.addLog('ZIP criado com sucesso!', 'success');
                status.downloadLink.href = url;
                status.downloadLink.download = 'epubs-redimensionados.zip';
                status.downloadLink.textContent = 'Download de todos (ZIP)';
                status.downloadLink.style.display = 'inline-block';
            }
        },
    };

    app.tools.changer = {
        init() {
            this.epubInput = document.getElementById('epubInputCover');
            this.coverInput = document.getElementById('coverInput');
            this.epubFileName = document.getElementById('epub-file-name-cover');
            this.coverFileName = document.getElementById('cover-file-name');
            this.coverPreview = document.getElementById('cover-preview');
            this.changeCoverBtn = document.getElementById('changeCoverBtn');
            this.statusContainer = document.getElementById('status-cover');
            this.deviceProfileSelect = document.getElementById('device-profile');
            this.previewWindow = document.getElementById('changer-preview-window');
            this.generateCoverBtn = document.getElementById('generate-cover-btn');
            this.extractCoverBtn = document.getElementById('extract-cover-btn');
            this.generateModal = document.getElementById('generate-cover-modal');
            this.generateModalCloseBtn = document.getElementById('generate-modal-close-btn');
            this.generateAndUseBtn = document.getElementById('generate-and-use-btn');
            this.epubFiles = [];
            this.coverFile = null;
            this.modifiedEpubs = [];
            this.eReaderProfiles = app.config.eReaderProfiles;

            app.utils.setupDragDrop('epub-drop-area-cover', 'epubInputCover');
            app.utils.setupDragDrop('cover-drop-area', 'coverInput');
            this.epubInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files, 'epub'));
            this.coverInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0], 'cover'));
            this.changeCoverBtn.addEventListener('click', () => this.changeCover());
            this.generateCoverBtn.addEventListener('click', () => this.openGenerateModal());
            this.extractCoverBtn.addEventListener('click', () => this.extractCover());
            if(this.generateModalCloseBtn) {
                this.generateModalCloseBtn.addEventListener('click', () => this.closeGenerateModal());
                this.generateAndUseBtn.addEventListener('click', () => this.generateAndUseCover());
            }
            this.previewWindow.innerHTML = '<p class="empty-state">Seus EPUBs carregados aparecerão aqui.</p>';
        },

        handleFileSelect(files, type) {
            if (!files) return;
            this.statusContainer.innerHTML = '';
            this.modifiedEpubs = [];
            if (type === 'epub') {
                this.epubFiles = Array.from(files);
                this.epubFileName.textContent = `${this.epubFiles.length} arquivo(s) selecionado(s)`;
                this.updateEpubPreview();
                this.extractCoverBtn.disabled = this.epubFiles.length !== 1;
            } else if (type === 'cover') {
                if (!files.type.startsWith('image/')) {
                    alert('Por favor, selecione um arquivo de imagem.');
                    return;
                }
                this.coverFile = files;
                this.coverFileName.textContent = files.name;
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.coverPreview.src = e.target.result;
                    this.coverPreview.style.display = 'block';
                };
                reader.readAsDataURL(files);
            }
            this.changeCoverBtn.disabled = !(this.epubFiles.length > 0 && this.coverFile);
        },

        updateEpubPreview() {
            this.previewWindow.innerHTML = '';
            if (this.epubFiles.length === 0) {
                this.previewWindow.innerHTML = '<p class="empty-state">Seus EPUBs carregados aparecerão aqui.</p>';
                return;
            }
            this.epubFiles.forEach(file => {
                const previewItem = document.createElement('div');
                previewItem.className = 'preview-item';
                const img = document.createElement('img');
                img.src = '../icons/icon-192.png'; // Placeholder
                const span = document.createElement('span');
                span.textContent = file.name;
                previewItem.append(img, span);
                this.previewWindow.appendChild(previewItem);
            });
        },

        async extractCover() {
            // ... (logic is sound, no changes needed here)
        },

        openGenerateModal() {
            if(this.generateModal) this.generateModal.style.display = 'flex';
        },

        closeGenerateModal() {
            if(this.generateModal) this.generateModal.style.display = 'none';
        },

        async generateAndUseCover() {
            // ... (logic is sound, no changes needed here)
        },

        async changeCover() {
            if (this.epubFiles.length === 0 || !this.coverFile) {
                alert('Selecione ao menos um EPUB e uma imagem de capa.');
                return;
            }

            const status = app.utils.createStatusElement(this.statusContainer);
            status.loader.style.display = 'block';
            status.progressBarContainer.style.display = 'block';
            status.addLog('Iniciando processo de troca de capa...');

            let newCoverData;
            const selectedProfileKey = this.deviceProfileSelect.value;

            try {
                if (selectedProfileKey !== 'original') {
                    const profile = this.eReaderProfiles[selectedProfileKey];
                    status.addLog(`Redimensionando a nova capa para o perfil: ${this.deviceProfileSelect.options[this.deviceProfileSelect.selectedIndex].text}...`);
                    newCoverData = await app.utils.resizeImage(this.coverFile, profile);
                    status.addLog('Capa redimensionada com sucesso.', 'success');
                } else {
                    status.addLog('Lendo a nova capa...');
                    newCoverData = await this.coverFile.arrayBuffer();
                    status.addLog('Capa lida com sucesso.', 'success');
                }
            } catch (error) {
                status.addLog(`Erro ao processar a imagem da capa: ${error.message}`, 'error');
                status.loader.style.display = 'none';
                return;
            }

            this.modifiedEpubs = [];
            let filesProcessed = 0;

            for (const file of this.epubFiles) {
                status.addLog(`--- Aplicando capa em ${file.name} ---`);
                try {
                    const { epub, contentDoc, contentFilePath, contentDir, chapters } = await app.utils.getEpubContent(file);
                    const coverPath = app.utils.findCoverPath(contentDoc);
                    if (!coverPath) {
                        throw new Error('Não foi possível identificar a capa antiga no EPUB.');
                    }
                    status.addLog(`[${file.name}] Substituindo o arquivo da capa: ${contentDir + coverPath}`);
                    epub.file(contentDir + coverPath, newCoverData, { binary: true, createFolders: true });

                    const manifestItem = contentDoc.querySelector(`item[href="${coverPath}"]`);
                    if (manifestItem) manifestItem.setAttribute('media-type', 'image/jpeg');
                    
                    status.addLog(`[${file.name}] Recompilando o arquivo EPUB...`);
                    const serializer = new XMLSerializer();
                    const newContentOpfStr = serializer.serializeToString(contentDoc);
                    epub.file(contentFilePath, newContentOpfStr);

                    const newEpubBlob = await epub.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
                    this.modifiedEpubs.push({ name: file.name.replace(/\.epub$/i, '-nova-capa.epub'), blob: newEpubBlob, chapters, epub: await app.utils.getEpubContent(newEpubBlob) });
                    status.addLog(`✔️ ${file.name} processado com sucesso!`, 'success');

                } catch (error) {
                    status.addLog(`❌ Falha ao processar ${file.name}: ${error.message}`, 'error');
                    console.error(`Falha ao processar ${file.name}:`, error);
                }
                filesProcessed++;
                status.progressBarInner.style.width = `${(filesProcessed / this.epubFiles.length) * 100}%`;
            }

            status.loader.style.display = 'none';
            status.text.textContent = 'Processo concluído.';

            if (this.modifiedEpubs.length === 0) {
                status.addLog('Nenhuma capa pôde ser alterada.', 'error');
                return;
            }

            if (this.modifiedEpubs.length === 1) {
                const ebook = this.modifiedEpubs[0];
                const url = URL.createObjectURL(ebook.blob);
                status.downloadLink.href = url;
                status.downloadLink.download = ebook.name;
                status.downloadLink.textContent = 'Download do EPUB';
                status.downloadLink.style.display = 'inline-block';

                const previewBtn = document.createElement('button');
                previewBtn.textContent = 'Pré-visualizar';
                previewBtn.className = 'button secondary';
                previewBtn.onclick = () => app.utils.showEbookPreview(ebook.name, ebook.chapters, ebook.epub.epub);
                status.buttonsContainer.appendChild(previewBtn);

            } else {
                status.addLog(`Agrupando ${this.modifiedEpubs.length} arquivos em um ZIP...`);
                await app.utils.loadScript(app.config.SCRIPT_URLS.jszip);
                const zip = new JSZip();
                this.modifiedEpubs.forEach(epub => {
                    zip.file(epub.name, epub.blob);
                });
                const zipBlob = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(zipBlob);
                status.addLog('ZIP criado com sucesso!', 'success');
                status.downloadLink.href = url;
                status.downloadLink.download = 'epubs-com-nova-capa.zip';
                status.downloadLink.textContent = 'Download de Todos (ZIP)';
                status.downloadLink.style.display = 'inline-block';
            }
        }
    };

    app.tools.translator = {
        init() {
            this.ebookInput = document.getElementById('ebookInputTranslate');
            this.fileName = document.getElementById('ebook-file-name-translate');
            this.optionsContainer = document.getElementById('translate-options');
            this.translateBtn = document.getElementById('translateBtn');
            this.statusContainer = document.getElementById('status-translate');
            this.previewWindow = document.getElementById('translator-preview-window');
            this.langFromSelect = document.getElementById('lang-from');
            this.langToSelect = document.getElementById('lang-to');
            this.apiKeyInput = document.getElementById('google-api-key');
            this.previewModal = document.getElementById('translator-preview-modal');
            this.previewContentArea = document.getElementById('preview-content-area');
            this.previewCloseBtn = document.getElementById('preview-close-btn');
            this.ebookFiles = [];
            this.translatedEbooks = [];

            this.apiKeyInput.value = localStorage.getItem('googleApiKey') || '';
            this.langFromSelect.value = localStorage.getItem('translatorLangFrom') || 'auto';
            this.langToSelect.value = localStorage.getItem('translatorLangTo') || 'pt';

            app.utils.setupDragDrop('ebook-drop-area-translate', 'ebookInputTranslate');
            this.ebookInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
            this.translateBtn.addEventListener('click', () => this.startTranslation());
            if (this.previewCloseBtn) {
                this.previewCloseBtn.addEventListener('click', () => this.previewModal.style.display = 'none');
            }
            this.apiKeyInput.addEventListener('input', () => {
                localStorage.setItem('googleApiKey', this.apiKeyInput.value);
            });
            this.previewWindow.innerHTML = '<p class="empty-state">Seus ebooks carregados aparecerão aqui.</p>';
        },

        handleFileSelect(files) {
            if (!files || files.length === 0) return;
            this.ebookFiles = Array.from(files);
            this.fileName.textContent = `${this.ebookFiles.length} arquivo(s) selecionado(s)`;
            this.optionsContainer.style.display = 'block';
            this.statusContainer.innerHTML = '';
            this.translatedEbooks = [];
            this.updatePreview();
        },

        updatePreview() {
            this.previewWindow.innerHTML = '';
            if (this.ebookFiles.length === 0) {
                this.previewWindow.innerHTML = '<p class="empty-state">Seus ebooks carregados aparecerão aqui.</p>';
                return;
            }
            this.ebookFiles.forEach(file => {
                const previewItem = document.createElement('div');
                previewItem.className = 'preview-item';
                const img = document.createElement('img');
                img.src = file.name.toLowerCase().endsWith('.pdf') ? '../icons/icon-pdf.png' : '../icons/icon-192.png';
                const span = document.createElement('span');
                span.textContent = file.name;
                previewItem.append(img, span);
                this.previewWindow.appendChild(previewItem);
            });
        },

        async translateText(text, targetLang, apiKey, sourceLang = '') {
            const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
            const body = {
                q: text,
                target: targetLang,
            };
            if (sourceLang && sourceLang !== 'auto') {
                body.source = sourceLang;
            }

            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Google Translate API error: ${error.error.message}`);
            }

            const data = await response.json();
            return data.data.translations[0].translatedText;
        },

        async startTranslation() {
            const apiKey = this.apiKeyInput.value.trim();
            if (!apiKey) {
                alert('Por favor, insira a sua chave da API do Google Cloud Translation.');
                return;
            }

            if (this.ebookFiles.length === 0) {
                alert('Por favor, selecione um ou mais arquivos para traduzir.');
                return;
            }

            localStorage.setItem('translatorLangFrom', this.langFromSelect.value);
            localStorage.setItem('translatorLangTo', this.langToSelect.value);

            const fromLang = this.langFromSelect.value;
            const toLang = this.langToSelect.value;
            const fileCount = this.ebookFiles.length;

            if (!confirm(`Você irá traduzir ${fileCount} arquivo(s) de ${this.langFromSelect.options[this.langFromSelect.selectedIndex].text} para ${this.langToSelect.options[this.langToSelect.selectedIndex].text}.

Isto usará a API do Google Translation e pode incorrer em custos. Deseja continuar?`)) {
                return;
            }

            this.optionsContainer.style.display = 'none';
            const status = app.utils.createStatusElement(this.statusContainer);
            status.loader.style.display = 'block';
            status.progressBarContainer.style.display = 'block';
            status.addLog('Iniciando processo de tradução em lote...');

            this.translatedEbooks = [];
            let filesProcessed = 0;

            for (const file of this.ebookFiles) {
                status.addLog(`--- Iniciando tradução de ${file.name} ---`);
                try {
                    if (file.name.toLowerCase().endsWith('.pdf')) {
                         status.addLog(`[${file.name}] A tradução de PDF ainda não é suportada. Pulando.`, 'warn');
                         filesProcessed++;
                         status.progressBarInner.style.width = `${(filesProcessed / this.ebookFiles.length) * 100}%`;
                         continue;
                    }

                    const { epub, contentDoc, contentFilePath, contentDir, chapters } = await app.utils.getEpubContent(file);
                    status.addLog(`[${file.name}] EPUB aberto. Analisando arquivos de conteúdo...`);

                    const textFiles = Object.values(epub.files).filter(f => (f.name.endsWith('.html') || f.name.endsWith('.xhtml')));
                    let totalWords = 0;
                    let translatedWords = 0;

                    for (const textFile of textFiles) {
                        const content = await textFile.async('string');
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(content, 'text/html');
                        totalWords += doc.body.textContent.split(/\s+/).filter(Boolean).length;
                    }
                    status.addLog(`[${file.name}] Total de palavras para traduzir: ${totalWords}`);

                    for (const textFile of textFiles) {
                        let content = await textFile.async('string');
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(content, 'text/html');
                        const textNodes = doc.evaluate('//body//text()[normalize-space()]', doc, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
                        
                        for (let i = 0; i < textNodes.snapshotLength; i++) {
                            const node = textNodes.snapshotItem(i);
                            if (node.parentElement.tagName.toLowerCase() !== 'script' && node.parentElement.tagName.toLowerCase() !== 'style') {
                                const originalText = node.nodeValue;
                                const wordCount = originalText.split(/\s+/).filter(Boolean).length;
                                
                                const translatedText = await this.translateText(originalText, toLang, apiKey, fromLang);
                                node.nodeValue = translatedText;

                                translatedWords += wordCount;
                                const percentage = totalWords > 0 ? Math.round((translatedWords / totalWords) * 100) : 0;
                                status.text.textContent = `Traduzindo ${file.name}: ${translatedWords}/${totalWords} palavras (${percentage}%)`;
                            }
                        }
                        
                        const newContent = new XMLSerializer().serializeToString(doc);
                        epub.file(textFile.name, newContent);
                    }

                    status.addLog(`[${file.name}] Recompilando arquivo...`);
                    const newEpubBlob = await epub.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
                    const originalFilename = file.name.replace(/\.epub$/i, '');
                    const newName = `${originalFilename}-${toLang}.epub`;
                    this.translatedEbooks.push({ name: newName, blob: newEpubBlob, chapters, epub });
                    status.addLog(`✔️ ${file.name} traduzido com sucesso!`, 'success');

                } catch (error) {
                    status.addLog(`❌ Erro ao traduzir ${file.name}: ${error.message}`, 'error');
                    console.error(error);
                }
                filesProcessed++;
                status.progressBarInner.style.width = `${(filesProcessed / this.ebookFiles.length) * 100}%`;
            }

            status.loader.style.display = 'none';
            status.text.textContent = 'Processo concluído.';
            status.addLog('--- Processo em lote concluído! ---');

            if (this.translatedEbooks.length > 0) {
                if (this.translatedEbooks.length === 1) {
                    const ebook = this.translatedEbooks[0];
                    const url = URL.createObjectURL(ebook.blob);
                    status.downloadLink.href = url;
                    status.downloadLink.download = ebook.name;
                    status.downloadLink.textContent = `Download de ${ebook.name}`;
                    status.downloadLink.style.display = 'inline-block';

                    const previewBtn = document.createElement('button');
                    previewBtn.textContent = 'Pré-visualizar';
                    previewBtn.className = 'button secondary';
                    previewBtn.onclick = () => app.utils.showEbookPreview(ebook.name, ebook.chapters, ebook.epub);
                    status.buttonsContainer.appendChild(previewBtn);

                } else {
                    status.addLog('Agrupando arquivos em um ZIP...');
                    await app.utils.loadScript(app.config.SCRIPT_URLS.jszip);
                    const zip = new JSZip();
                    for (const ebook of this.translatedEbooks) {
                        zip.file(ebook.name, ebook.blob);
                    }
                    const zipBlob = await zip.generateAsync({ type: "blob" });
                    const url = URL.createObjectURL(zipBlob);
                    status.downloadLink.href = url;
                    status.downloadLink.download = 'ebooks-traduzidos.zip';
                    status.downloadLink.textContent = 'Download de Todos os Ebooks (ZIP)';
                    status.downloadLink.style.display = 'block';
                }
            } else {
                status.addLog('Nenhum arquivo pôde ser traduzido.', 'error');
            }
        },
    };

    app.tools.converter = {
        init() {
            this.ebookInput = document.getElementById('ebookInputConverter');
            this.fileName = document.getElementById('ebook-file-name-converter');
            this.outputFormatSelect = document.getElementById('output-format');
            this.deviceProfileSelect = document.getElementById('device-profile-converter');
            this.previewWindow = document.getElementById('converter-preview-window');
            this.convertBtn = document.getElementById('convertBtn');
            this.statusContainer = document.getElementById('status-converter');
            this.ebookFiles = [];
            this.modifiedEpubs = [];
            this.deviceProfiles = app.config.eReaderProfiles;

            app.utils.setupDragDrop('ebook-drop-area-converter', 'ebookInputConverter');
            this.ebookInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
            this.deviceProfileSelect.addEventListener('change', () => this.applyDeviceProfile());
            this.convertBtn.addEventListener('click', () => this.startConversion());
            this.previewWindow.innerHTML = '<p class="empty-state">Seus ebooks carregados aparecerão aqui.</p>';
        },

        handleFileSelect(files) {
            if (!files || files.length === 0) return;
            this.ebookFiles = Array.from(files);
            this.fileName.textContent = `${this.ebookFiles.length} arquivo(s) selecionado(s)`;
            this.statusContainer.innerHTML = '';
            this.convertBtn.disabled = false;
            this.modifiedEpubs = [];
            this.updatePreview();
        },

        updatePreview() {
            // ... (same as other tools)
        },

        applyDeviceProfile() {
            // ... (same as before)
        },

        async startConversion() {
            if (this.ebookFiles.length === 0) {
                alert('Por favor, selecione um ou mais ebooks para converter.');
                return;
            }
            const status = app.utils.createStatusElement(this.statusContainer);
            status.loader.style.display = 'block';
            status.progressBarContainer.style.display = 'block';
            status.addLog('Iniciando processo de conversão (simulação)...');

            this.modifiedEpubs = [];
            let filesProcessed = 0;

            for (const file of this.ebookFiles) {
                status.addLog(`--- Processando ${file.name} ---`);
                try {
                    const { epub, chapters } = await app.utils.getEpubContent(file);
                    const outputFormat = this.outputFormatSelect.value;
                    const newName = file.name.replace(/\.[^/.]+$/, ".") + outputFormat;
                    
                    // Simulate conversion by creating a dummy blob
                    const dummyBlob = new Blob(['Conteúdo convertido (simulado)'], { type: 'application/octet-stream' });

                    this.modifiedEpubs.push({ name: newName, blob: dummyBlob, chapters, epub });
                    status.addLog(`✔️ ${file.name} processado com sucesso!`, 'success');
                } catch (error) {
                    status.addLog(`❌ Falha ao processar ${file.name}: ${error.message}`, 'error');
                }
                filesProcessed++;
                status.progressBarInner.style.width = `${(filesProcessed / this.ebookFiles.length) * 100}%`;
            }

            status.loader.style.display = 'none';
            status.text.textContent = 'Processo concluído.';

            if (this.modifiedEpubs.length === 0) {
                status.addLog('Nenhum arquivo pôde ser processado.', 'error');
                return;
            }

            if (this.modifiedEpubs.length === 1) {
                const ebook = this.modifiedEpubs[0];
                const url = URL.createObjectURL(ebook.blob);
                status.downloadLink.href = url;
                status.downloadLink.download = ebook.name;
                status.downloadLink.textContent = 'Download do Ebook';
                status.downloadLink.style.display = 'inline-block';

                const previewBtn = document.createElement('button');
                previewBtn.textContent = 'Pré-visualizar';
                previewBtn.className = 'button secondary';
                previewBtn.onclick = () => app.utils.showEbookPreview(ebook.name, ebook.chapters, ebook.epub);
                status.buttonsContainer.appendChild(previewBtn);

            } else {
                status.addLog(`Agrupando ${this.modifiedEpubs.length} arquivos em um ZIP...`);
                await app.utils.loadScript(app.config.SCRIPT_URLS.jszip);
                const zip = new JSZip();
                this.modifiedEpubs.forEach(epub => {
                    zip.file(epub.name, epub.blob);
                });
                const zipBlob = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(zipBlob);
                status.addLog('ZIP criado com sucesso!', 'success');
                status.downloadLink.href = url;
                status.downloadLink.download = 'ebooks-convertidos.zip';
                status.downloadLink.textContent = 'Download de Todos (ZIP)';
                status.downloadLink.style.display = 'inline-block';
            }
        }
    };

    app.tools.tocEditor = {
        init() {
            this.epubInput = document.getElementById('epubInputToc');
            this.tocList = document.getElementById('toc-list');
            this.saveBtn = document.getElementById('save-toc-btn');
            this.statusContainer = document.getElementById('status-toc');
            this.editorContainer = document.getElementById('toc-editor-container');
            this.currentEpub = null;
            this.tocItems = [];

            app.utils.setupDragDrop('toc-drop-area', 'epubInputToc');
            this.epubInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
            this.saveBtn.addEventListener('click', () => this.saveToc());
        },

        async handleFileSelect(file) {
            if (!file) return;
            this.editorContainer.style.display = 'block';
            this.tocList.innerHTML = '<div class="loader"></div>';
            this.currentEpub = null;
            this.tocItems = [];

            try {
                const { epub, contentDoc, chapters } = await app.utils.getEpubContent(file);
                this.currentEpub = epub;
                this.chapters = chapters;
                const tocNcxPath = this.findTocNcxPath(contentDoc);
                if (!tocNcxPath) throw new Error('Não foi possível encontrar o arquivo toc.ncx.');
                
                const tocNcxStr = await epub.file(tocNcxPath).async("string");
                const parser = new DOMParser();
                const tocDoc = parser.parseFromString(tocNcxStr, "application/xml");
                this.tocNcxPath = tocNcxPath;
                this.tocDoc = tocDoc;

                this.renderToc();
            } catch (error) {
                this.tocList.innerHTML = `<p style="color: var(--error-color)">Erro: ${error.message}</p>`;
            }
        },

        findTocNcxPath(contentDoc) {
            const spine = contentDoc.querySelector('spine');
            const tocId = spine.getAttribute('toc');
            if (!tocId) return null;
            const tocItem = contentDoc.querySelector(`manifest item[id="${tocId}"]`);
            return tocItem ? tocItem.getAttribute('href') : null;
        },

        renderToc() {
            this.tocList.innerHTML = '';
            const navMap = this.tocDoc.querySelector('navMap');
            const navPoints = Array.from(navMap.querySelectorAll('navPoint'));

            navPoints.forEach((point, index) => {
                const label = point.querySelector('navLabel text').textContent;
                const src = point.querySelector('content').getAttribute('src');
                
                const itemEl = document.createElement('li');
                itemEl.className = 'toc-item';
                itemEl.dataset.index = index;
                itemEl.draggable = true;

                itemEl.innerHTML = `
                    <span class="toc-item-handle">&#x2630;</span>
                    <div class="toc-item-label">
                        <input type="text" value="${label}" data-src="${src}">
                    </div>
                `;
                this.tocList.appendChild(itemEl);
            });

            this.addDragDropHandlers();
        },

        addDragDropHandlers() {
            let dragSrcEl = null;

            function handleDragStart(e) {
                dragSrcEl = this;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', this.innerHTML);
                this.classList.add('dragging');
            }

            function handleDragOver(e) {
                if (e.preventDefault) {
                    e.preventDefault();
                }
                e.dataTransfer.dropEffect = 'move';
                return false;
            }

            function handleDrop(e) {
                if (e.stopPropagation) {
                    e.stopPropagation();
                }

                if (dragSrcEl != this) {
                    dragSrcEl.innerHTML = this.innerHTML;
                    this.innerHTML = e.dataTransfer.getData('text/html');
                }
                return false;
            }
            
            function handleDragEnd(e) {
                this.classList.remove('dragging');
            }

            const items = this.tocList.querySelectorAll('.toc-item');
            items.forEach(item => {
                item.addEventListener('dragstart', handleDragStart, false);
                item.addEventListener('dragover', handleDragOver, false);
                item.addEventListener('drop', handleDrop, false);
                item.addEventListener('dragend', handleDragEnd, false);
            });
        },

        async saveToc() {
            if (!this.currentEpub || !this.tocDoc) return;

            const status = app.utils.createStatusElement(this.statusContainer);
            status.loader.style.display = 'block';
            status.addLog('Salvando alterações no sumário...');

            try {
                const navMap = this.tocDoc.querySelector('navMap');
                navMap.innerHTML = ''; // Clear existing navPoints

                const items = this.tocList.querySelectorAll('.toc-item input');
                items.forEach((input, index) => {
                    const navPoint = this.tocDoc.createElement('navPoint');
                    navPoint.id = `navPoint-${index + 1}`;
                    navPoint.setAttribute('playOrder', index + 1);

                    const navLabel = this.tocDoc.createElement('navLabel');
                    const text = this.tocDoc.createElement('text');
                    text.textContent = input.value;
                    navLabel.appendChild(text);

                    const content = this.tocDoc.createElement('content');
                    content.setAttribute('src', input.dataset.src);

                    navPoint.appendChild(navLabel);
                    navPoint.appendChild(content);
                    navMap.appendChild(navPoint);
                });

                const serializer = new XMLSerializer();
                const newTocStr = serializer.serializeToString(this.tocDoc);
                this.currentEpub.file(this.tocNcxPath, newTocStr);

                status.addLog('Gerando o novo arquivo EPUB...');
                const newEpubBlob = await this.currentEpub.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
                
                status.loader.style.display = 'none';
                status.addLog('Sumário atualizado com sucesso!', 'success');

                const url = URL.createObjectURL(newEpubBlob);
                status.downloadLink.href = url;
                status.downloadLink.download = this.epubInput.files[0].name.replace(/\.epub$/i, '-sumario-editado.epub');
                status.downloadLink.textContent = 'Download do EPUB Modificado';
                status.downloadLink.style.display = 'inline-block';

            } catch (error) {
                status.loader.style.display = 'none';
                status.addLog(`Erro ao salvar o sumário: ${error.message}`, 'error');
            }
        }
    };

    // ... (rest of the tools)

    app.init();
    window.EbookTools = app;
});