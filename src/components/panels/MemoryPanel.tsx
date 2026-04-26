import {
  Archive,
  ArchiveRestore,
  Bookmark,
  Bot,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  GitBranch,
  Globe,
  History,
  KeyRound,
  Layers,
  Link,
  Link2Off,
  LogOut,
  Mail,
  Maximize2,
  Menu,
  MemoryStick,
  MoreHorizontal,
  Mic,
  Minimize2,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Square,
  SunMedium,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AUTO_ROUTE_MODES,
  AUTO_ROUTE_OPTIONS,
  BUILT_IN_AGENTS,
  DEFAULT_MODEL_CATALOG,
  DEFAULT_MODELS,
  BUILT_IN_PRESETS,
  MODEL_LABELS,
  MODEL_TOKEN_LIMIT_RULES,
  PROVIDERS,
  BUILT_IN_SKILLS,
  type FunctionPreset,
} from '../../config/chatConfig';
import { type AgentDefinition, type AgentExecutorType } from '../../../shared/agentDefinitions';
import { type ChatMessage } from '../../hooks/useChatReducer';
import { type ToolDefinition } from '../../hooks/useBotFormReducer';
import {
  formatAttachmentSize,
  isImageFile,
  isPdfFile,
  isSupportedAttachmentFile,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_CHARS,
} from '../../utils/chatAttachments';
import { parseArtifacts, hasArtifacts } from '../../utils/artifacts';
import { useAppContext } from '../../contexts/AppContext';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function MemoryPanel() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const {
    isDarkMode, setIsDarkMode,
    token, setToken,
    user, setUser,
    authLoading, setAuthLoading,
    activeTab, setActiveTab,
    provider, setProvider,
    model, setModel,
    prompt, setPrompt,
    chatState, dispatchChat,
    messages, conversationId, isSending, chatError,
    setConversationId, setMessages, setIsSending, setChatError,
    isListening, setIsListening,
    interimTranscript, setInterimTranscript,
    availableProviders, setAvailableProviders,
    defaultLocalModel, setDefaultLocalModel,
    modelCatalog, setModelCatalog,
    providerStatuses, setProviderStatuses,
    isRefreshingModels, setIsRefreshingModels,
    ollamaModels, setOllamaModels,
    ollamaModelsLoading, setOllamaModelsLoading,
    ollamaModelsError, setOllamaModelsError,
    ollamaPullName, setOllamaPullName,
    ollamaPullLog, setOllamaPullLog,
    ollamaPulling, setOllamaPulling,
    ollamaDeleting, setOllamaDeleting,
    ragDocuments, setRagDocuments,
    ragUploading, setRagUploading,
    ragUploadError, setRagUploadError,
    ragDeleting, setRagDeleting,
    history, setHistory,
    historyLoading, setHistoryLoading,
    historySearch, setHistorySearch,
    chatSearch, setChatSearch,
    showChatSearch, setShowChatSearch,
    sessionSystemPrompt, setSessionSystemPrompt,
    memorySuggestion, setMemorySuggestion,
    showArchivedHistory, setShowArchivedHistory,
    projects, setProjects,
    activeProjectFilter, setActiveProjectFilter,
    creatingProject, setCreatingProject,
    newProjectName, setNewProjectName,
    editingProjectId, setEditingProjectId,
    editingProject, setEditingProject,
    newProjectColor, setNewProjectColor,
    newProjectSystemPrompt, setNewProjectSystemPrompt,
    assigningConvId, setAssigningConvId,
    openConvMenuId, setOpenConvMenuId,
    factsSearch, setFactsSearch,
    sidebarSearch, setSidebarSearch,
    sidebarSearchFocused, setSidebarSearchFocused,
    conversationLabels, setConversationLabels,
    pinnedConversations, setPinnedConversations,
    conversationModels, setConversationModels,
    promptTemplates, setPromptTemplates,
    showTemplatesMenu, setShowTemplatesMenu,
    newTemplateTitle, setNewTemplateTitle,
    newTemplateText, setNewTemplateText,
    googleCredentialsSaving, setGoogleCredentialsSaving,
    googleClientIdInput, setGoogleClientIdInput,
    googleClientSecretInput, setGoogleClientSecretInput,
    googleStatus, setGoogleStatus,
    googleNotice, setGoogleNotice,
    editingLabelId, setEditingLabelId,
    labelDraft, setLabelDraft,
    facts, setFacts,
    memoryFiles, setMemoryFiles,
    memoryUrls, setMemoryUrls,
    agentFactCounts, setAgentFactCounts,
    customSkills, setCustomSkills,
    customAgents, setCustomAgents,
    apiKeys, setApiKeys,
    dailyTokens, setDailyTokens,
    dailyModelUsage, setDailyModelUsage,
    dailyProviderUsage, setDailyProviderUsage,
    usageTrend, setUsageTrend,
    usagePeriod, setUsagePeriod,
    systemPrompt, setSystemPrompt,
    localUrl, setLocalUrl,
    useMemory, setUseMemory,
    autoMemory, setAutoMemory,
    sandboxMode, setSandboxMode,
    webSearchEnabled, setWebSearchEnabled,
    tavilyConfigured, setTavilyConfigured,
    attachedRagDoc, setAttachedRagDoc,
    showRagDocMenu, setShowRagDocMenu,
    sharingConvId, setSharingConvId,
    shareLink, setShareLink,
    shareLoading, setShareLoading,
    historyRetentionDays, setHistoryRetentionDays,
    telegramBotToken, setTelegramBotToken,
    telegramBotEnabled, setTelegramBotEnabled,
    telegramAllowedChatIds, setTelegramAllowedChatIds,
    telegramProvider, setTelegramProvider,
    telegramModel, setTelegramModel,
    telegramDigestEnabled, setTelegramDigestEnabled,
    telegramDigestHour, setTelegramDigestHour,
    telegramStatus, setTelegramStatus,
    loadingTelegramStatus, setLoadingTelegramStatus,
    sendingTelegramTest, setSendingTelegramTest,
    telegramTestResult, setTelegramTestResult,
    activePresetId, setActivePresetId,
    applyingFunctionId, setApplyingFunctionId,
    selectedSlashIndex, setSelectedSlashIndex,
    hasSidebarPreference, setHasSidebarPreference,
    isSidebarExpanded, setIsSidebarExpanded,
    isFullscreen, setIsFullscreen,
    isSidebarDrawerOpen, setIsSidebarDrawerOpen,
    isChatSidebarOpen, setIsChatSidebarOpen,
    recentSlashItemIds, setRecentSlashItemIds,
    newFact, setNewFact,
    newUrl, setNewUrl,
    agentFacts, setAgentFacts,
    expandedAgentMemory, setExpandedAgentMemory,
    pendingAttachments, setPendingAttachments,
    isDragOverComposer, setIsDragOverComposer,
    savingBotId, setSavingBotId,
    deletingBotId, setDeletingBotId,
    confirmingDeleteBotId, setConfirmingDeleteBotId,
    confirmingClearHistory, setConfirmingClearHistory,
    keyInputs, setKeyInputs,
    savingKey, setSavingKey,
    savingSettings, setSavingSettings,
    creatingFunction, setCreatingFunction,
    isExportingMemory, setIsExportingMemory,
    isImportingMemory, setIsImportingMemory,
    copiedMessageIndex, setCopiedMessageIndex,
    pendingMemoryRestore, setPendingMemoryRestore,
    memoryRestorePreview, setMemoryRestorePreview,
    notice, setNotice,
    showScrollResumeBtn, setShowScrollResumeBtn,
    showShortcuts, setShowShortcuts,
    patchNewSkill, resetNewSkill,
    newSkillTitle, newSkillCommand, newSkillDescription, newSkillSystemPrompt,
    patchNewBot, resetNewBot,
    newBotTitle, newBotDescription, newBotCommand, newBotProvider, newBotModel,
    newBotMemoryMode, newBotExecutorType, newBotEndpoint, newBotSystemPrompt,
    newBotTools, newBotMaxTurns,
    patchEditingBot, resetEditingBot, loadEditingBot,
    editingBotId, editingBotTitle, editingBotDescription, editingBotCommand,
    editingBotUseWhen, editingBotBoundaries, editingBotProvider, editingBotModel,
    editingBotMemoryMode, editingBotExecutorType, editingBotEndpoint, editingBotSystemPrompt,
    editingBotTools, editingBotMaxTurns,
    ragFileInputRef, factFileInputRef, factImportRef,
    importMemoryInputRef, importAgentInputRef, attachmentInputRef,
    composerDropRef, composerTextareaRef, speechRecognitionRef,
    chatAbortControllerRef, chatScrollRef,
    authHeaders, allPresets, skillPresets, agentPresets, usedCommands,
    builtInAgents, customAgentsPresets, activePreset, slashCommands,
    activeBotPreset, conversationTokenWarning, slashMenuItems, groupedSlashItems,
    conversations, sortedModelUsage, latestAssistantMessage,
    trendPeak, providerPeak, modelPeak, sidebarSearchResults,
    currentRuntimeProvider, currentRuntimeModel, currentRuntimeTokenUsage,
    sectionCardClass, elevatedCardClass, inputClass, textInputClass, textareaClass,
    subtleTextClass, mutedTextClass, sectionLabelClass, navButtonClass,
    sidebarPrimaryButtonClass, primaryButtonClass, shellUtilityButtonClass,
    sidebarTextClass, sidebarBlockClass, sidebarStatsClass, sidebarCompactButtonClass,
    telegramStatusToneClass, telegramStatusLabel, telegramStatusDetails,
    actionButtonClass, listButtonClass, secondaryButtonClass, destructiveButtonClass,
    responsiveButtonClass, responsivePrimaryButtonClass, responsiveSecondaryButtonClass,
    responsiveDestructiveButtonClass, noticeClass, emptyStateClass,
    refreshAll, stopCurrentResponse, sendPrompt, startNewChat, loadConversation,
    openTab, handleLogout, toggleVoiceInput, handlePromptKeyDown, handleSystemPromptKeyDown,
    addChatFiles, removePendingAttachment, refreshModels,
    refreshTelegramStatus, sendTelegramTest,
    toggleFullscreenMode, toggleSidebarPreference, closeMobileSidebar,
    clearFunctionPreset, executeSlashCommand, activateSlashItem,
    activateFunctionPreset, dismissSlashMode, rememberSlashItem,
    saveSystemPromptOnly, createCustomSkill, createCustomBot,
    startEditingCustomBot, stopEditingCustomBot,
    requestDeleteCustomBot, cancelDeleteCustomBot,
    exportAgents, importAgentsFromFile, saveEditedCustomBot, deleteCustomBot,
    activateSlashSkill, clearAllHistory, deleteConversation,
    archiveConversation, unarchiveConversation, shareConversation, revokeShare,
    createProject, updateProject, deleteProject,
    assignConversationToProject, saveConversationLabel, togglePinConversation,
    savePromptTemplate, deletePromptTemplate, applyPromptTemplate,
    loadGoogleStatus, saveGoogleCredentials, startGoogleOAuth, disconnectGoogle,
    exportConversation, exportConversationCSV,
    addFact, importFactsFromFile, deleteFact, loadAgentFacts,
    deleteAgentFact, clearAgentFacts, toggleAgentMemory, addFactFiles,
    deleteMemoryFile, addUrl, deleteUrl,
    uploadRagDocument, deleteRagDocument,
    loadOllamaModels, pullOllamaModel, deleteOllamaModel,
    saveKey, saveSettings, toggleSandboxModeFromMenu,
    exportMemoryBackup, resetMemoryRestoreSelection, prepareMemoryRestore, importMemoryBackup,
    getAgentExecutorType, getAgentEndpoint, getAgentExecutorLabel,
    formatProviderLabel, formatRoutingModeLabel, formatProviderSourceLabel,
    getProviderStatusTone, formatProviderReadinessLabel,
    humanizeFallbackModelName, formatModelOptionLabel, formatModelDisplay,
    getPresetActivationLabel, getPresetAutonomyLabel, getPresetRoutingLabel, getPresetMemoryLabel,
    getSlashItemPanelClass, getSlashItemBadgeClass,
    inferProviderFromModel, isAutoRouteProvider, getProviderSelectValue,
    getEstimatedModelTokenLimit, formatTokenUsage,
    getSuggestedChatModel, getSelectableModels, getPreferredSelectableModel,
    supportsSpeechRecognition,
    ARTIFACT_LANG_SET,
    ArtifactBlock, MarkdownMessage,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useAppContext() as Record<string, any>;

  return (
              <div className="space-y-4 flex-1 min-h-0 overflow-auto pb-4">
                <section className={sectionCardClass}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-medium">Documents (RAG)</h3>
                      <p className={`text-sm ${subtleTextClass} mt-1`}>Upload text files to be retrieved and injected into chat context automatically. Requires an OpenAI key.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input ref={ragFileInputRef} type="file" accept=".txt,.md,.csv,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadRagDocument(f); }} />
                      <button onClick={() => ragFileInputRef.current?.click()} disabled={ragUploading} className={responsivePrimaryButtonClass}>
                        <Upload className="w-4 h-4" />
                        {ragUploading ? 'Uploading...' : 'Upload file'}
                      </button>
                    </div>
                  </div>
                  {ragUploadError ? <p className={`text-sm mb-3 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{ragUploadError}</p> : null}
                  {ragDocuments.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {ragDocuments.map(doc => (
                        <div key={doc.name} className={`${elevatedCardClass} flex items-center justify-between gap-3`}>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{doc.name}</div>
                            <div className={`text-xs ${subtleTextClass}`}>{doc.chunks} chunk{doc.chunks === 1 ? '' : 's'} · {new Date(doc.createdAt).toLocaleDateString()}</div>
                          </div>
                          <button
                            onClick={() => void deleteRagDocument(doc.name)}
                            disabled={ragDeleting === doc.name}
                            className={`shrink-0 ${secondaryButtonClass}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-sm ${subtleTextClass}`}>No documents uploaded yet. Upload .txt, .md, .csv, or .json files.</p>
                  )}
                </section>

                <div className={`${sectionCardClass} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
                  <div>
                    <h3 className="font-medium">Memory backup</h3>
                    <p className={`text-sm ${subtleTextClass} mt-1`}>Download a backup or restore one to replace the current user's saved facts, URLs, settings, and recent history.</p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <input
                      ref={importMemoryInputRef}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void prepareMemoryRestore(file);
                        }
                      }}
                    />
                    <button onClick={() => importMemoryInputRef.current?.click()} disabled={isImportingMemory} className={responsiveSecondaryButtonClass}>
                      <Upload className="w-4 h-4" />
                      {isImportingMemory ? 'Restoring...' : 'Restore backup'}
                    </button>
                    <button onClick={() => void exportMemoryBackup()} disabled={isExportingMemory} className={responsivePrimaryButtonClass}>
                      <Download className="w-4 h-4" />
                      {isExportingMemory ? 'Exporting...' : 'Backup memory now'}
                    </button>
                  </div>
                </div>

                {memoryRestorePreview ? (
                  <div className={`${sectionCardClass} space-y-4`}>
                    <div>
                      <h3 className="font-medium">Restore preview</h3>
                      <p className={`text-sm ${subtleTextClass} mt-1`}>Review this backup before restoring it. Confirming will replace the current signed-in user's saved backup data.</p>
                    </div>

                    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                      <div className={elevatedCardClass}>
                        <div className={subtleTextClass}>Facts</div>
                        <div className="mt-1 text-xl font-semibold">{memoryRestorePreview.facts}</div>
                      </div>
                      <div className={elevatedCardClass}>
                        <div className={subtleTextClass}>Files</div>
                        <div className="mt-1 text-xl font-semibold">{memoryRestorePreview.files}</div>
                      </div>
                      <div className={elevatedCardClass}>
                        <div className={subtleTextClass}>URLs</div>
                        <div className="mt-1 text-xl font-semibold">{memoryRestorePreview.urls}</div>
                      </div>
                      <div className={elevatedCardClass}>
                        <div className={subtleTextClass}>History</div>
                        <div className="mt-1 text-xl font-semibold">{memoryRestorePreview.history}</div>
                      </div>
                    </div>

                    <div className={`grid gap-2 text-sm ${subtleTextClass} md:grid-cols-2`}>
                      <div>File: {memoryRestorePreview.fileName}</div>
                      <div>Exported at: {memoryRestorePreview.exportedAt ? new Date(memoryRestorePreview.exportedAt).toLocaleString() : 'unknown'}</div>
                      <div>Includes runtime settings: {memoryRestorePreview.includesSettings ? 'yes' : 'no'}</div>
                      <div>Includes system prompt: {memoryRestorePreview.includesSystemPrompt ? 'yes' : 'no'}</div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button onClick={() => void importMemoryBackup()} disabled={isImportingMemory} className={responsivePrimaryButtonClass}>
                        <Upload className="w-4 h-4" />
                        {isImportingMemory ? 'Restoring...' : 'Confirm restore'}
                      </button>
                      <button onClick={resetMemoryRestoreSelection} disabled={isImportingMemory} className={responsiveSecondaryButtonClass}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-3">
                  <section className={sectionCardClass}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-medium">Facts</h3>
                      <span className={`text-xs ${subtleTextClass}`}>{facts.length} stored</span>
                    </div>
                    <form onSubmit={addFact} className="mb-4 flex flex-col gap-2 sm:flex-row">
                      <input value={newFact} onChange={event => setNewFact(event.target.value)} placeholder="User prefers concise technical responses" className={`flex-1 ${inputClass}`} />
                      <button className={responsivePrimaryButtonClass}>Add</button>
                      <button type="button" onClick={() => factImportRef.current?.click()} className={responsiveSecondaryButtonClass} title="Import facts from a .txt or .md file (one fact per line)">
                        <Upload className="w-4 h-4" />
                        Import
                      </button>
                    </form>
                    <input ref={factImportRef} type="file" accept=".txt,.md" className="hidden" onChange={event => void importFactsFromFile(event.target.files)} />
                    {facts.length > 4 ? (
                      <div className="mb-3 relative">
                        <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${subtleTextClass}`} />
                        <input value={factsSearch} onChange={event => setFactsSearch(event.target.value)} placeholder="Filter facts…" className={`w-full pl-7 text-sm ${inputClass}`} />
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      {facts.filter(item => !factsSearch.trim() || item.content.toLowerCase().includes(factsSearch.toLowerCase())).map(item => (
                        <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                          <div className="text-sm">{item.content}</div>
                          <button onClick={() => void deleteFact(item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      {facts.length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No saved facts yet.</div> : null}
                      {facts.length > 0 && factsSearch.trim() && facts.filter(item => item.content.toLowerCase().includes(factsSearch.toLowerCase())).length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No facts match your filter.</div> : null}
                    </div>
                  </section>

                  {customAgents.filter(agent => agent.memoryMode === 'isolated').map(agent => (
                    <section key={agent.id} className={sectionCardClass}>
                      <button
                        type="button"
                        className="mb-3 flex w-full items-center justify-between gap-3 text-left"
                        onClick={() => toggleAgentMemory(agent.id)}
                      >
                        <div>
                          <h3 className="font-medium">{agent.title} — isolated memory</h3>
                          <p className={`mt-0.5 text-xs ${subtleTextClass}`}>/{agent.command}</p>
                        </div>
                        <span className={`text-xs ${subtleTextClass}`}>{expandedAgentMemory[agent.id] ? '▲' : '▼'}</span>
                      </button>
                      {expandedAgentMemory[agent.id] ? (
                        <div className="space-y-2">
                          {(agentFacts[agent.id] || []).map(item => (
                            <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                              <div className="text-sm">{item.content}</div>
                              <button onClick={() => void deleteAgentFact(agent.id, item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                            </div>
                          ))}
                          {(agentFacts[agent.id] || []).length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No isolated facts yet for this agent.</div> : null}
                          {(agentFacts[agent.id] || []).length > 0 ? (
                            <button
                              type="button"
                              onClick={() => void clearAgentFacts(agent.id)}
                              className={responsiveDestructiveButtonClass}
                            >
                              <Trash2 className="w-4 h-4" /> Clear all agent facts
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  ))}

                  <section className={sectionCardClass}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">Files</h3>
                        <p className={`mt-1 text-sm ${subtleTextClass}`}>Upload text, PDF, or image files. Botty extracts text and includes it alongside your saved facts.</p>
                      </div>
                      <span className={`text-xs ${subtleTextClass}`}>{memoryFiles.length} stored</span>
                    </div>
                    <input
                      ref={factFileInputRef}
                      type="file"
                      multiple
                      accept=".txt,.md,.csv,.json,.pdf,image/*,.log,.yaml,.yml,.xml"
                      className="hidden"
                      onChange={event => {
                        void addFactFiles(event.target.files);
                      }}
                    />
                    <button type="button" onClick={() => factFileInputRef.current?.click()} className={`mb-4 ${responsivePrimaryButtonClass}`}>
                      Add files
                    </button>
                    <div className="space-y-2">
                      {memoryFiles.map(item => (
                        <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{item.name}</div>
                            <div className={`mt-1 text-xs ${subtleTextClass}`}>
                              {[item.type || 'text', typeof item.size === 'number' ? formatAttachmentSize(item.size) : null].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <button onClick={() => void deleteMemoryFile(item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      {memoryFiles.length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No saved files yet.</div> : null}
                    </div>
                  </section>

                  <section className={sectionCardClass}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-medium">Saved URLs</h3>
                      <span className={`text-xs ${subtleTextClass}`}>{memoryUrls.length} stored</span>
                    </div>
                    <form onSubmit={addUrl} className="mb-4 flex flex-col gap-2 sm:flex-row">
                      <input value={newUrl} onChange={event => setNewUrl(event.target.value)} placeholder="https://docs.anthropic.com/" className={`flex-1 ${inputClass}`} />
                      <button className={responsivePrimaryButtonClass}>Add</button>
                    </form>
                    <div className="space-y-2">
                      {memoryUrls.map(item => (
                        <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                          <div>
                            <div className="text-sm font-medium">{item.title || item.url}</div>
                            <div className={`mt-1 text-xs ${subtleTextClass}`}>{item.url}</div>
                          </div>
                          <button onClick={() => void deleteUrl(item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      {memoryUrls.length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No saved URLs yet.</div> : null}
                    </div>
                  </section>
                </div>
              </div>
  );
}
