export const LANGUAGES = ["es", "en", "fr", "it", "ca", "de", "zh-CN"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
  it: "Italiano",
  ca: "Català",
  de: "Deutsch",
  "zh-CN": "简体中文",
};

const es = {
  windowTitle: "Mermagram",
  toolbar: "Herramientas de Mermagram",
  file: "Archivo",
  fileMenu: "Archivo",
  open: "Abrir",
  mermaidDiagram: "Diagrama Mermaid…",
  save: "Guardar",
  diagram: "Diagrama",
  saveAs: "Guardar como",
  diagramEllipsis: "Diagrama…",
  openRecent: "Abrir recientes",
  noRecent: "Todavía no hay archivos recientes.",
  toggleEditor: "Mostrar u ocultar el editor",
  toggleEditorTitle: "Mostrar / ocultar editor (⌘B)",
  zoomOut: "Reducir",
  zoomOutTitle: "Reducir (⌘−)",
  zoomIn: "Ampliar",
  zoomInTitle: "Ampliar (⌘+)",
  fit: "Ajustar",
  fitTitle: "Ajustar a pantalla (⇧F)",
  reset: "Restablecer",
  resetTitle: "Restablecer la vista (⌘0)",
  export: "Exportar",
  exportFormat: "Formato de exportación",
  rasterImage: "Imagen rasterizada",
  vectorEditable: "Vector editable",
  pdfDocument: "Documento vectorial",
  editor: "Editor de código Mermaid",
  checking: "Comprobando…",
  viewer: "Visor del diagrama",
  preparingCanvas: "Preparando lienzo…",
  dragToMove: "Arrastrá para mover",
  wheelToZoom: "Rueda para zoom",
  resizeEditor: "Redimensionar el panel del editor",
  openEditor: "Abrir el editor",
  preferences: "Preferencias…",
  preferencesTitle: "Preferencias",
  language: "Idioma",
  preferencesClose: "Cerrar",
  appearance: "Apariencia",
  appearanceDescription: "Elige la piel visual de la aplicación.",
  layoutPreference: "Distribución",
  layoutDescription: "Elige cómo se organizan el editor y el visor.",
  themeNeumorphicLight: "Neumorfismo claro",
  themeNeumorphicDark: "Neumorfismo oscuro",
  themeGlassLight: "Glassmorfismo claro",
  themeGlassDark: "Glassmorfismo oscuro",
  themeRetro: "Retro",
  themeDialUp: "Dial-up · BBS",
  layoutClassic: "Clásica",
  layoutBento: "Bento Grid",
  syntaxValid: "Sintaxis válida",
  syntaxChecking: "Comprobando sintaxis…",
  syntaxLine: "Línea {line}: {message}",
  syntaxErrorsTitle: "Detalles de errores de sintaxis",
  closeSyntaxErrors: "Cerrar detalles de errores",
  closeTab: "Cerrar pestaña",
  syntaxErrorAtLine: "Línea {line}:",
  syntaxError: "Error de renderizado del diagrama.",
  editorMeta: "{lines} líneas · {characters} car.",
  unnamedFile: "Archivo sin nombre",
  editDocumentName: "Editar nombre del documento: {name}",
  editDocumentNameTitle: "Haz clic para cambiar el nombre de este documento sin guardar",
  unsaved: "Cambios sin guardar",
  saved: "Guardado",
  newDocument: "Documento nuevo",
  locationUnavailable: "Ubicación no disponible",
  openFileLabel: "Abrir {name}",
  lastEdited: "Última edición · {date}",
  savedDiagram: "Diagrama Mermaid guardado.",
  savedChanges: "Cambios guardados · {name}",
  openedDiagram: "Diagrama abierto · {name}",
  openRecentError: "No se pudo abrir el archivo reciente.",
  openDiagramError: "No se pudo abrir el diagrama.",
  saveDiagramError: "No se pudo guardar el diagrama.",
  closeWindowError: "No se pudo cerrar la ventana.",
  unsavedClosePrompt: "Hay cambios sin guardar. ¿Deseas guardarlos antes de cerrar?",
  saveBeforeClose: "Cambios sin guardar",
  doNotSave: "No guardar",
  cancel: "Cancelar",
  exportCancelled: "Exportación cancelada.",
  exported: "Diagrama exportado como {format} · {path}",
  exportError: "No se pudo exportar el diagrama.",
  noValidDiagram: "Todavía no hay un diagrama válido para exportar.",
  rasterizeError: "No se pudo rasterizar el diagrama.",
  canvasUnavailable: "El lienzo de rasterizado no está disponible.",
  pngError: "No se pudo generar la imagen PNG.",
  imageReadError: "No se pudo leer la imagen.",
  desktopRecentOnly: "Los archivos recientes solo están disponibles en la app de escritorio.",
  desktopSaveOnly: "Guardar sobre el archivo solo está disponible en la app de escritorio.",
} as const;

type TranslationKey = keyof typeof es;
type Catalog = Partial<Record<TranslationKey, string>>;

const translations: Record<Language, Catalog> = {
  es,
  en: {
    windowTitle: "Mermagram", toolbar: "Mermagram tools", file: "File", fileMenu: "File", open: "Open", mermaidDiagram: "Mermaid diagram…", save: "Save", diagram: "Diagram", saveAs: "Save as", diagramEllipsis: "Diagram…", openRecent: "Open recent", noRecent: "There are no recent files yet.", toggleEditor: "Show or hide the editor", toggleEditorTitle: "Show / hide editor (⌘B)", zoomOut: "Zoom out", zoomIn: "Zoom in", fit: "Fit", fitTitle: "Fit to screen (⇧F)", reset: "Reset", resetTitle: "Reset view (⌘0)", export: "Export", exportFormat: "Export format", rasterImage: "Raster image", vectorEditable: "Editable vector", pdfDocument: "Vector document", editor: "Mermaid code editor", checking: "Checking…", viewer: "Diagram viewer", preparingCanvas: "Preparing canvas…", dragToMove: "Drag to move", wheelToZoom: "Scroll to zoom", resizeEditor: "Resize editor panel", openEditor: "Open the editor", preferences: "Preferences…", preferencesTitle: "Preferences", language: "Language", preferencesClose: "Close", syntaxValid: "Valid syntax", syntaxChecking: "Checking syntax…", syntaxLine: "Line {line}: {message}", syntaxError: "Diagram rendering error.", editorMeta: "{lines} lines · {characters} chars.", unnamedFile: "Untitled", unsaved: "Unsaved changes", saved: "Saved", newDocument: "New document", locationUnavailable: "Location unavailable", openFileLabel: "Open {name}", savedDiagram: "Mermaid diagram saved.", savedChanges: "Changes saved · {name}", openedDiagram: "Diagram opened · {name}", openRecentError: "Could not open the recent file.", openDiagramError: "Could not open the diagram.", saveDiagramError: "Could not save the diagram.", closeWindowError: "Could not close the window.", unsavedClosePrompt: "There are unsaved changes. Do you want to save them before closing?", saveBeforeClose: "Unsaved changes", doNotSave: "Don't save", cancel: "Cancel", exportCancelled: "Export cancelled.", exported: "Diagram exported as {format} · {path}", exportError: "Could not export the diagram.", noValidDiagram: "There is no valid diagram to export yet.", rasterizeError: "Could not rasterize the diagram.", canvasUnavailable: "The rasterization canvas is unavailable.", pngError: "Could not generate the PNG image.", imageReadError: "Could not read the image.", desktopRecentOnly: "Recent files are only available in the desktop app.", desktopSaveOnly: "Saving over the file is only available in the desktop app.",
  },
  fr: {
    windowTitle: "Mermagram", toolbar: "Outils Mermagram", file: "Fichier", fileMenu: "Fichier", open: "Ouvrir", mermaidDiagram: "Diagramme Mermaid…", save: "Enregistrer", diagram: "Diagramme", saveAs: "Enregistrer sous", diagramEllipsis: "Diagramme…", openRecent: "Ouvrir les fichiers récents", noRecent: "Aucun fichier récent pour le moment.", toggleEditor: "Afficher ou masquer l’éditeur", toggleEditorTitle: "Afficher / masquer l’éditeur (⌘B)", zoomOut: "Dézoomer", zoomOutTitle: "Dézoomer (⌘−)", zoomIn: "Zoomer", zoomInTitle: "Zoomer (⌘+)", fit: "Ajuster", fitTitle: "Ajuster à l’écran (⇧F)", reset: "Réinitialiser", resetTitle: "Réinitialiser la vue (⌘0)", export: "Exporter", exportFormat: "Format d’exportation", rasterImage: "Image matricielle", vectorEditable: "Vecteur modifiable", pdfDocument: "Document vectoriel", editor: "Éditeur de code Mermaid", checking: "Vérification…", viewer: "Aperçu du diagramme", preparingCanvas: "Préparation du canevas…", dragToMove: "Faire glisser pour déplacer", wheelToZoom: "Défiler pour zoomer", resizeEditor: "Redimensionner le panneau de l’éditeur", openEditor: "Ouvrir l’éditeur", preferences: "Préférences…", preferencesTitle: "Préférences", language: "Langue", preferencesClose: "Fermer", syntaxValid: "Syntaxe valide", syntaxChecking: "Vérification de la syntaxe…", syntaxLine: "Ligne {line} : {message}", syntaxError: "Erreur de rendu du diagramme.", editorMeta: "{lines} lignes · {characters} car.", unnamedFile: "Sans titre", unsaved: "Modifications non enregistrées", saved: "Enregistré", newDocument: "Nouveau document", locationUnavailable: "Emplacement indisponible", openFileLabel: "Ouvrir {name}", savedDiagram: "Diagramme Mermaid enregistré.", savedChanges: "Modifications enregistrées · {name}", openedDiagram: "Diagramme ouvert · {name}", openRecentError: "Impossible d’ouvrir le fichier récent.", openDiagramError: "Impossible d’ouvrir le diagramme.", saveDiagramError: "Impossible d’enregistrer le diagramme.", closeWindowError: "Impossible de fermer la fenêtre.", unsavedClosePrompt: "Des modifications ne sont pas enregistrées. Voulez-vous les enregistrer avant de fermer ?", saveBeforeClose: "Modifications non enregistrées", doNotSave: "Ne pas enregistrer", cancel: "Annuler", exportCancelled: "Exportation annulée.", exported: "Diagramme exporté en {format} · {path}", exportError: "Impossible d’exporter le diagramme.", noValidDiagram: "Aucun diagramme valide à exporter pour le moment.", rasterizeError: "Impossible de pixelliser le diagramme.", canvasUnavailable: "Le canevas de pixellisation est indisponible.", pngError: "Impossible de générer l’image PNG.", imageReadError: "Impossible de lire l’image.", desktopRecentOnly: "Les fichiers récents sont uniquement disponibles dans l’application de bureau.", desktopSaveOnly: "L’enregistrement du fichier courant est uniquement disponible dans l’application de bureau.",
  },
  it: {
    windowTitle: "Mermagram", toolbar: "Strumenti Mermagram", file: "File", fileMenu: "File", open: "Apri", mermaidDiagram: "Diagramma Mermaid…", save: "Salva", diagram: "Diagramma", saveAs: "Salva con nome", diagramEllipsis: "Diagramma…", openRecent: "Apri recenti", noRecent: "Non ci sono ancora file recenti.", toggleEditor: "Mostra o nascondi l’editor", toggleEditorTitle: "Mostra / nascondi editor (⌘B)", zoomOut: "Riduci zoom", zoomIn: "Aumenta zoom", fit: "Adatta", fitTitle: "Adatta allo schermo (⇧F)", reset: "Reimposta", resetTitle: "Reimposta visualizzazione (⌘0)", export: "Esporta", exportFormat: "Formato di esportazione", rasterImage: "Immagine raster", vectorEditable: "Vettoriale modificabile", pdfDocument: "Documento vettoriale", editor: "Editor di codice Mermaid", checking: "Verifica…", viewer: "Visualizzatore diagramma", preparingCanvas: "Preparazione canvas…", dragToMove: "Trascina per spostare", wheelToZoom: "Scorri per ingrandire", resizeEditor: "Ridimensiona pannello editor", openEditor: "Apri l’editor", preferences: "Preferenze…", preferencesTitle: "Preferenze", language: "Lingua", preferencesClose: "Chiudi", syntaxValid: "Sintassi valida", syntaxChecking: "Verifica sintassi…", syntaxLine: "Riga {line}: {message}", syntaxError: "Errore di rendering del diagramma.", editorMeta: "{lines} righe · {characters} car.", unnamedFile: "Senza titolo", unsaved: "Modifiche non salvate", saved: "Salvato", newDocument: "Nuovo documento", locationUnavailable: "Percorso non disponibile", openFileLabel: "Apri {name}", savedDiagram: "Diagramma Mermaid salvato.", savedChanges: "Modifiche salvate · {name}", openedDiagram: "Diagramma aperto · {name}", openRecentError: "Impossibile aprire il file recente.", openDiagramError: "Impossibile aprire il diagramma.", saveDiagramError: "Impossibile salvare il diagramma.", closeWindowError: "Impossibile chiudere la finestra.", unsavedClosePrompt: "Ci sono modifiche non salvate. Vuoi salvarle prima di chiudere?", saveBeforeClose: "Modifiche non salvate", doNotSave: "Non salvare", cancel: "Annulla", exportCancelled: "Esportazione annullata.", exported: "Diagramma esportato come {format} · {path}", exportError: "Impossibile esportare il diagramma.", noValidDiagram: "Non c’è ancora un diagramma valido da esportare.", rasterizeError: "Impossibile rasterizzare il diagramma.", canvasUnavailable: "Il canvas di rasterizzazione non è disponibile.", pngError: "Impossibile generare l’immagine PNG.", imageReadError: "Impossibile leggere l’immagine.",
  },
  ca: {
    windowTitle: "Mermagram", toolbar: "Eines de Mermagram", file: "Fitxer", fileMenu: "Fitxer", open: "Obrir", mermaidDiagram: "Diagrama Mermaid…", save: "Desar", diagram: "Diagrama", saveAs: "Anomena i desa", diagramEllipsis: "Diagrama…", openRecent: "Obrir recents", noRecent: "Encara no hi ha fitxers recents.", toggleEditor: "Mostra o amaga l’editor", toggleEditorTitle: "Mostra / amaga l’editor (⌘B)", zoomOut: "Redueix", zoomIn: "Amplia", fit: "Ajusta", fitTitle: "Ajusta a la pantalla (⇧F)", reset: "Restableix", resetTitle: "Restableix la vista (⌘0)", export: "Exporta", exportFormat: "Format d’exportació", rasterImage: "Imatge ràster", vectorEditable: "Vector editable", pdfDocument: "Document vectorial", editor: "Editor de codi Mermaid", checking: "Comprovant…", viewer: "Visor del diagrama", preparingCanvas: "Preparant el llenç…", dragToMove: "Arrossega per moure", wheelToZoom: "Desplaça per fer zoom", resizeEditor: "Redimensiona el panell de l’editor", openEditor: "Obre l’editor", preferences: "Preferències…", preferencesTitle: "Preferències", language: "Idioma", preferencesClose: "Tanca", syntaxValid: "Sintaxi vàlida", syntaxChecking: "Comprovant la sintaxi…", syntaxLine: "Línia {line}: {message}", syntaxError: "Error en representar el diagrama.", editorMeta: "{lines} línies · {characters} car.", unnamedFile: "Sense títol", unsaved: "Canvis sense desar", saved: "Desat", newDocument: "Document nou", locationUnavailable: "Ubicació no disponible", openFileLabel: "Obre {name}", savedDiagram: "Diagrama Mermaid desat.", savedChanges: "Canvis desats · {name}", openedDiagram: "Diagrama obert · {name}", openRecentError: "No s’ha pogut obrir el fitxer recent.", openDiagramError: "No s’ha pogut obrir el diagrama.", saveDiagramError: "No s’ha pogut desar el diagrama.", closeWindowError: "No s’ha pogut tancar la finestra.", unsavedClosePrompt: "Hi ha canvis sense desar. Vols desar-los abans de tancar?", saveBeforeClose: "Canvis sense desar", doNotSave: "No desis", cancel: "Cancel·la", exportCancelled: "Exportació cancel·lada.", exported: "Diagrama exportat com a {format} · {path}", exportError: "No s’ha pogut exportar el diagrama.", noValidDiagram: "Encara no hi ha cap diagrama vàlid per exportar.", rasterizeError: "No s’ha pogut rasteritzar el diagrama.", canvasUnavailable: "El llenç de rasterització no està disponible.", pngError: "No s’ha pogut generar la imatge PNG.", imageReadError: "No s’ha pogut llegir la imatge.",
  },
  de: {
    windowTitle: "Mermagram", toolbar: "Mermagram-Werkzeuge", file: "Datei", fileMenu: "Datei", open: "Öffnen", mermaidDiagram: "Mermaid-Diagramm…", save: "Speichern", diagram: "Diagramm", saveAs: "Speichern unter", diagramEllipsis: "Diagramm…", openRecent: "Zuletzt verwendet", noRecent: "Noch keine zuletzt verwendeten Dateien.", toggleEditor: "Editor ein- oder ausblenden", toggleEditorTitle: "Editor ein-/ausblenden (⌘B)", zoomOut: "Verkleinern", zoomIn: "Vergrößern", fit: "Einpassen", fitTitle: "An Bildschirm anpassen (⇧F)", reset: "Zurücksetzen", resetTitle: "Ansicht zurücksetzen (⌘0)", export: "Exportieren", exportFormat: "Exportformat", rasterImage: "Rasterbild", vectorEditable: "Bearbeitbare Vektorgrafik", pdfDocument: "Vektordokument", editor: "Mermaid-Code-Editor", checking: "Wird geprüft…", viewer: "Diagrammansicht", preparingCanvas: "Arbeitsfläche wird vorbereitet…", dragToMove: "Zum Verschieben ziehen", wheelToZoom: "Zum Zoomen scrollen", resizeEditor: "Größe des Editorbereichs ändern", openEditor: "Editor öffnen", preferences: "Einstellungen…", preferencesTitle: "Einstellungen", language: "Sprache", preferencesClose: "Schließen", syntaxValid: "Syntax gültig", syntaxChecking: "Syntax wird geprüft…", syntaxLine: "Zeile {line}: {message}", syntaxError: "Fehler beim Rendern des Diagramms.", editorMeta: "{lines} Zeilen · {characters} Zeichen.", unnamedFile: "Unbenannt", unsaved: "Nicht gespeicherte Änderungen", saved: "Gespeichert", newDocument: "Neues Dokument", locationUnavailable: "Speicherort nicht verfügbar", openFileLabel: "{name} öffnen", savedDiagram: "Mermaid-Diagramm gespeichert.", savedChanges: "Änderungen gespeichert · {name}", openedDiagram: "Diagramm geöffnet · {name}", openRecentError: "Zuletzt verwendete Datei konnte nicht geöffnet werden.", openDiagramError: "Diagramm konnte nicht geöffnet werden.", saveDiagramError: "Diagramm konnte nicht gespeichert werden.", closeWindowError: "Fenster konnte nicht geschlossen werden.", unsavedClosePrompt: "Es gibt ungespeicherte Änderungen. Möchten Sie vor dem Schließen speichern?", saveBeforeClose: "Nicht gespeicherte Änderungen", doNotSave: "Nicht speichern", cancel: "Abbrechen", exportCancelled: "Export abgebrochen.", exported: "Diagramm exportiert als {format} · {path}", exportError: "Diagramm konnte nicht exportiert werden.", noValidDiagram: "Noch kein gültiges Diagramm zum Exportieren vorhanden.", rasterizeError: "Diagramm konnte nicht gerastert werden.", canvasUnavailable: "Rasterfläche ist nicht verfügbar.", pngError: "PNG-Bild konnte nicht erstellt werden.", imageReadError: "Bild konnte nicht gelesen werden.",
  },
  "zh-CN": {
    windowTitle: "Mermagram", toolbar: "Mermagram 工具", file: "文件", fileMenu: "文件", open: "打开", mermaidDiagram: "Mermaid 图表…", save: "保存", diagram: "图表", saveAs: "另存为", diagramEllipsis: "图表…", openRecent: "打开最近文件", noRecent: "暂无最近文件。", toggleEditor: "显示或隐藏编辑器", toggleEditorTitle: "显示/隐藏编辑器 (⌘B)", zoomOut: "缩小", zoomIn: "放大", fit: "适应", fitTitle: "适应屏幕 (⇧F)", reset: "重置", resetTitle: "重置视图 (⌘0)", export: "导出", exportFormat: "导出格式", rasterImage: "位图", vectorEditable: "可编辑矢量图", pdfDocument: "矢量文档", editor: "Mermaid 代码编辑器", checking: "正在检查…", viewer: "图表预览", preparingCanvas: "正在准备画布…", dragToMove: "拖动以移动", wheelToZoom: "滚动以缩放", resizeEditor: "调整编辑器面板大小", openEditor: "打开编辑器", preferences: "偏好设置…", preferencesTitle: "偏好设置", language: "语言", preferencesClose: "关闭", syntaxValid: "语法有效", syntaxChecking: "正在检查语法…", syntaxLine: "第 {line} 行：{message}", syntaxError: "图表渲染错误。", editorMeta: "{lines} 行 · {characters} 个字符。", unnamedFile: "未命名文件", unsaved: "有未保存的更改", saved: "已保存", newDocument: "新文档", locationUnavailable: "位置不可用", openFileLabel: "打开 {name}", savedDiagram: "Mermaid 图表已保存。", savedChanges: "更改已保存 · {name}", openedDiagram: "图表已打开 · {name}", openRecentError: "无法打开最近使用的文件。", openDiagramError: "无法打开图表。", saveDiagramError: "无法保存图表。", closeWindowError: "无法关闭窗口。", unsavedClosePrompt: "有未保存的更改。关闭前要保存吗？", saveBeforeClose: "未保存的更改", doNotSave: "不保存", cancel: "取消", exportCancelled: "导出已取消。", exported: "图表已导出为 {format} · {path}", exportError: "无法导出图表。", noValidDiagram: "暂无可导出的有效图表。", rasterizeError: "无法栅格化图表。", canvasUnavailable: "栅格化画布不可用。", pngError: "无法生成 PNG 图片。", imageReadError: "无法读取图片。",
  },
};

Object.assign(translations.en, {
  appearance: "Appearance", appearanceDescription: "Choose the app's visual skin.", layoutPreference: "Layout", layoutDescription: "Choose how the editor and viewer are arranged.",
  themeNeumorphicLight: "Light neumorphism", themeNeumorphicDark: "Dark neumorphism", themeGlassLight: "Light glassmorphism", themeGlassDark: "Dark glassmorphism", themeRetro: "Retro", themeDialUp: "Dial-up · BBS", layoutClassic: "Classic", layoutBento: "Bento Grid",
  syntaxErrorsTitle: "Syntax error details", closeSyntaxErrors: "Close error details", closeTab: "Close tab", syntaxErrorAtLine: "Line {line}:",
  editDocumentName: "Edit document name: {name}", editDocumentNameTitle: "Click to rename this unsaved document", lastEdited: "Last edited · {date}",
});
Object.assign(translations.fr, {
  appearance: "Apparence", appearanceDescription: "Choisissez le style visuel de l’application.", layoutPreference: "Disposition", layoutDescription: "Choisissez l’organisation de l’éditeur et de l’aperçu.",
  themeNeumorphicLight: "Néomorphisme clair", themeNeumorphicDark: "Néomorphisme sombre", themeGlassLight: "Glassmorphisme clair", themeGlassDark: "Glassmorphisme sombre", themeRetro: "Rétro", themeDialUp: "Dial-up · BBS", layoutClassic: "Classique", layoutBento: "Bento Grid",
  syntaxErrorsTitle: "Détails des erreurs de syntaxe", closeSyntaxErrors: "Fermer les détails des erreurs", closeTab: "Fermer l’onglet", syntaxErrorAtLine: "Ligne {line} :",
  editDocumentName: "Modifier le nom du document : {name}", editDocumentNameTitle: "Cliquez pour renommer ce document non enregistré", lastEdited: "Dernière modification · {date}",
});
Object.assign(translations.it, {
  appearance: "Aspetto", appearanceDescription: "Scegli lo stile visivo dell’app.", layoutPreference: "Disposizione", layoutDescription: "Scegli come organizzare editor e visualizzatore.",
  themeNeumorphicLight: "Neumorfismo chiaro", themeNeumorphicDark: "Neumorfismo scuro", themeGlassLight: "Glassmorfismo chiaro", themeGlassDark: "Glassmorfismo scuro", themeRetro: "Retrò", themeDialUp: "Dial-up · BBS", layoutClassic: "Classica", layoutBento: "Bento Grid",
  syntaxErrorsTitle: "Dettagli degli errori di sintassi", closeSyntaxErrors: "Chiudi i dettagli degli errori", closeTab: "Chiudi scheda", syntaxErrorAtLine: "Riga {line}:",
  editDocumentName: "Modifica nome documento: {name}", editDocumentNameTitle: "Fai clic per rinominare questo documento non salvato", lastEdited: "Ultima modifica · {date}",
});
Object.assign(translations.ca, {
  appearance: "Aparença", appearanceDescription: "Tria l’estil visual de l’aplicació.", layoutPreference: "Distribució", layoutDescription: "Tria com s’organitzen l’editor i el visor.",
  themeNeumorphicLight: "Neomorfisme clar", themeNeumorphicDark: "Neomorfisme fosc", themeGlassLight: "Glassmorfisme clar", themeGlassDark: "Glassmorfisme fosc", themeRetro: "Retro", themeDialUp: "Dial-up · BBS", layoutClassic: "Clàssica", layoutBento: "Bento Grid",
  syntaxErrorsTitle: "Detalls dels errors de sintaxi", closeSyntaxErrors: "Tanca els detalls dels errors", closeTab: "Tanca la pestanya", syntaxErrorAtLine: "Línia {line}:",
  editDocumentName: "Edita el nom del document: {name}", editDocumentNameTitle: "Fes clic per canviar el nom d’aquest document sense desar", lastEdited: "Última edició · {date}",
});
Object.assign(translations.de, {
  appearance: "Erscheinungsbild", appearanceDescription: "Wählen Sie den visuellen Stil der App.", layoutPreference: "Anordnung", layoutDescription: "Wählen Sie die Anordnung von Editor und Vorschau.",
  themeNeumorphicLight: "Heller Neumorphismus", themeNeumorphicDark: "Dunkler Neumorphismus", themeGlassLight: "Heller Glassmorphismus", themeGlassDark: "Dunkler Glassmorphismus", themeRetro: "Retro", themeDialUp: "Dial-up · BBS", layoutClassic: "Klassisch", layoutBento: "Bento Grid",
  syntaxErrorsTitle: "Details zu Syntaxfehlern", closeSyntaxErrors: "Fehlerdetails schließen", closeTab: "Tab schließen", syntaxErrorAtLine: "Zeile {line}:",
  editDocumentName: "Dokumentnamen bearbeiten: {name}", editDocumentNameTitle: "Klicken, um dieses ungespeicherte Dokument umzubenennen", lastEdited: "Zuletzt geändert · {date}",
});
Object.assign(translations["zh-CN"], {
  appearance: "外观", appearanceDescription: "选择应用的视觉风格。", layoutPreference: "布局", layoutDescription: "选择编辑器和预览区的排列方式。",
  themeNeumorphicLight: "浅色新拟态", themeNeumorphicDark: "深色新拟态", themeGlassLight: "浅色玻璃拟态", themeGlassDark: "深色玻璃拟态", themeRetro: "复古", themeDialUp: "拨号上网 · BBS", layoutClassic: "经典", layoutBento: "Bento 网格",
  syntaxErrorsTitle: "语法错误详情", closeSyntaxErrors: "关闭错误详情", closeTab: "关闭标签页", syntaxErrorAtLine: "第 {line} 行：",
  editDocumentName: "编辑文档名称：{name}", editDocumentNameTitle: "点击以重命名此未保存的文档", lastEdited: "最后修改 · {date}",
});

translations.en.zoomOutTitle = "Zoom out (⌘−)";
translations.en.zoomInTitle = "Zoom in (⌘+)";
translations.fr.zoomOutTitle = "Dézoomer (⌘−)";
translations.fr.zoomInTitle = "Zoomer (⌘+)";
translations.it.zoomOutTitle = "Riduci zoom (⌘−)";
translations.it.zoomInTitle = "Aumenta zoom (⌘+)";
translations.ca.zoomOutTitle = "Redueix (⌘−)";
translations.ca.zoomInTitle = "Amplia (⌘+)";
translations.de.zoomOutTitle = "Verkleinern (⌘−)";
translations.de.zoomInTitle = "Vergrößern (⌘+)";
translations["zh-CN"].zoomOutTitle = "缩小 (⌘−)";
translations["zh-CN"].zoomInTitle = "放大 (⌘+)";
translations.en.desktopRecentOnly = "Recent files are only available in the desktop app.";
translations.fr.desktopRecentOnly = "Les fichiers récents sont uniquement disponibles dans l’application de bureau.";
translations.it.desktopRecentOnly = "I file recenti sono disponibili solo nell’app desktop.";
translations.ca.desktopRecentOnly = "Els fitxers recents només estan disponibles a l’aplicació d’escriptori.";
translations.de.desktopRecentOnly = "Zuletzt verwendete Dateien sind nur in der Desktop-App verfügbar.";
translations["zh-CN"].desktopRecentOnly = "最近文件仅在桌面应用中可用。";
translations.en.desktopSaveOnly = "Saving over the current file is only available in the desktop app.";
translations.fr.desktopSaveOnly = "L’enregistrement du fichier courant est uniquement disponible dans l’application de bureau.";
translations.it.desktopSaveOnly = "Il salvataggio sul file corrente è disponibile solo nell’app desktop.";
translations.ca.desktopSaveOnly = "Desar sobre el fitxer actual només està disponible a l’aplicació d’escriptori.";
translations.de.desktopSaveOnly = "Das Überschreiben der aktuellen Datei ist nur in der Desktop-App verfügbar.";
translations["zh-CN"].desktopSaveOnly = "仅桌面应用支持覆盖保存当前文件。";

const STORAGE_KEY = "mermagram:language";
let currentLanguage: Language = "es";
const listeners = new Set<() => void>();

export function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
  const template = translations[currentLanguage][key] ?? es[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

function applyStaticTranslations(): void {
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n as TranslationKey);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((element) => {
    element.title = t(element.dataset.i18nTitle as TranslationKey);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria as TranslationKey));
  });
}

export function initI18n(): void {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    currentLanguage = LANGUAGES.includes(stored as Language) ? stored as Language : "es";
  } catch {
    currentLanguage = "es";
  }
  applyStaticTranslations();
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(language: Language): void {
  if (!LANGUAGES.includes(language)) return;
  currentLanguage = language;
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The interface can still switch for this session if storage is unavailable.
  }
  applyStaticTranslations();
  listeners.forEach((listener) => listener());
}

export function onLanguageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
