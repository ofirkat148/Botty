import { useState } from 'react';
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
export default function SettingsPanel() {
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
    exportAgents, importAgentsFromFile, saveEditedCustomBot, deleteCustomBot, scanLocalAgents, createLocalAgent,
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

  const [localAgentScanning, setLocalAgentScanning] = useState(false);
  const [localAgentScanResults, setLocalAgentScanResults] = useState<Array<{ title: string; command: string; description: string; systemPrompt: string; port: number }>>([]);
  const [localAgentScanError, setLocalAgentScanError] = useState('');
  const [addingLocalAgentPort, setAddingLocalAgentPort] = useState<number | null>(null);

  async function handleScanLocalAgents() {
    setLocalAgentScanning(true);
    setLocalAgentScanError('');
    setLocalAgentScanResults([]);
    try {
      const results = await scanLocalAgents();
      setLocalAgentScanResults(results as Array<{ title: string; command: string; description: string; systemPrompt: string; port: number }>);
      if (results.length === 0) setLocalAgentScanError('No local agents found on ports 7001–7099.');
    } catch {
      setLocalAgentScanError('Scan failed. Make sure your local adapters are running.');
    } finally {
      setLocalAgentScanning(false);
    }
  }

  async function handleAddLocalAgent(manifest: { title: string; command: string; description: string; systemPrompt: string; port: number }) {
    setAddingLocalAgentPort(manifest.port);
    try {
      await createLocalAgent(manifest);
      setLocalAgentScanResults(prev => prev.filter(r => r.port !== manifest.port));
    } finally {
      setAddingLocalAgentPort(null);
    }
  }

  return (
              <div className="space-y-4 flex-1 min-h-0 overflow-auto pb-4">
                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <KeyRound className="w-4 h-4" />
                    <h3 className="font-medium">Provider keys</h3>
                  </div>
                  <div className={`mb-4 rounded-[0.9rem] border px-4 py-3 text-sm ${isDarkMode ? 'border-emerald-400/20 bg-emerald-500/8 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                    <strong>Free options:</strong> Local (Ollama) needs no key — just a running model. Google Gemini Flash has a generous free tier (1,500 requests/day) via <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="underline">aistudio.google.com</a>. <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="underline">Groq</a> is free (14,400 req/day) with fast Llama 3.3 70B.
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {['anthropic', 'google', 'openai', 'groq'].map(providerName => {
                      const saved = apiKeys.find(k => k.provider === providerName);
                      return (
                      <div key={providerName} className={`${elevatedCardClass} flex flex-col gap-3`}>
                        <div className="text-sm font-medium capitalize mb-2">{providerName}</div>
                        <input
                          value={keyInputs[providerName] || ''}
                          onChange={event => setKeyInputs(prev => ({ ...prev, [providerName]: event.target.value }))}
                          placeholder={saved ? saved.hint : `${providerName.toUpperCase()}_API_KEY`}
                          className={textInputClass}
                        />
                        <button onClick={() => void saveKey(providerName)} className={responsivePrimaryButtonClass} disabled={savingKey === providerName}>
                          {savingKey === providerName ? 'Saving...' : saved ? 'Replace key' : 'Save key'}
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4" />
                    <h3 className="font-medium">Web search</h3>
                  </div>
                  <p className={`mb-3 text-sm ${subtleTextClass}`}>
                    Botty can search the web before answering when the Search toggle is on in the composer.
                    Powered by <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" className="underline">Tavily</a> — free tier: 1,000 searches/month.
                    Get a key at <a href="https://app.tavily.com" target="_blank" rel="noopener noreferrer" className="underline">app.tavily.com</a>.
                  </p>
                  <div className={`${elevatedCardClass} flex flex-col gap-3`}>
                    <div className="text-sm font-medium">Tavily API key</div>
                    <input
                      value={keyInputs['tavily'] || ''}
                      onChange={event => setKeyInputs(prev => ({ ...prev, tavily: event.target.value }))}
                      placeholder={apiKeys.find(k => k.provider === 'tavily')?.hint ?? 'tvly-...'}
                      className={textInputClass}
                    />
                    <button onClick={() => void saveKey('tavily')} className={responsivePrimaryButtonClass} disabled={savingKey === 'tavily'}>
                      {savingKey === 'tavily' ? 'Saving...' : apiKeys.find(k => k.provider === 'tavily') ? 'Replace key' : 'Save key'}
                    </button>
                  </div>
                  <div className={`mt-3 rounded-[0.9rem] border px-4 py-3 text-sm ${tavilyConfigured ? (isDarkMode ? 'border-emerald-400/20 bg-emerald-500/8 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800') : (isDarkMode ? 'border-white/8 text-stone-400' : 'border-stone-200 text-stone-500')}`}>
                    {tavilyConfigured
                      ? <>Key configured. Use the <Globe className="inline w-3.5 h-3.5 mx-0.5 -mt-0.5" /> Search button in the composer to enable per-message.</>
                      : <>No key saved. Enter your Tavily key above.</>
                    }
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <MemoryStick className="w-4 h-4" />
                      <h3 className="font-medium">Local models (Ollama)</h3>
                    </div>
                    <button onClick={() => void loadOllamaModels()} className={`${secondaryButtonClass} flex items-center gap-1.5`} disabled={ollamaModelsLoading}>
                      <RefreshCw className={`w-3.5 h-3.5 ${ollamaModelsLoading ? 'animate-spin' : ''}`} />
                      {ollamaModelsLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>

                  {ollamaModelsError ? (
                    <div className={`mb-3 rounded-[0.9rem] border px-4 py-3 text-sm ${isDarkMode ? 'border-red-400/20 bg-red-500/8 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
                      {ollamaModelsError}
                    </div>
                  ) : null}

                  {ollamaModels.length > 0 ? (
                    <div className="grid gap-2 mb-4">
                      {ollamaModels.map(m => (
                        <div key={m.name} className={`${elevatedCardClass} flex items-center justify-between gap-3`}>
                          <div>
                            <div className="text-sm font-medium font-mono">{m.name}</div>
                            <div className={`text-xs mt-0.5 ${subtleTextClass}`}>
                              {m.details?.parameter_size ?? ''}{m.details?.family ? ` · ${m.details.family}` : ''}{m.size ? ` · ${(m.size / 1e9).toFixed(1)} GB` : ''}
                            </div>
                          </div>
                          <button
                            onClick={() => void deleteOllamaModel(m.name)}
                            disabled={ollamaDeleting === m.name}
                            className={`${subtleTextClass} hover:text-red-600 disabled:opacity-40`}
                            title="Delete model"
                          >
                            {ollamaDeleting === m.name ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : !ollamaModelsLoading && !ollamaModelsError ? (
                    <div className={`mb-4 text-sm ${subtleTextClass}`}>No models installed. Pull one below.</div>
                  ) : null}

                  <div className={`${elevatedCardClass} flex flex-col gap-3`}>
                    <div className="text-sm font-medium">Pull a model</div>
                    <div className="flex gap-2">
                      <input
                        value={ollamaPullName}
                        onChange={e => setOllamaPullName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !ollamaPulling) void pullOllamaModel(); }}
                        placeholder="e.g. llama3.2:3b or nomic-embed-text"
                        className={`${textInputClass} flex-1`}
                        disabled={ollamaPulling}
                      />
                      <button onClick={() => void pullOllamaModel()} className={responsivePrimaryButtonClass} disabled={ollamaPulling || !ollamaPullName.trim()}>
                        {ollamaPulling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </button>
                    </div>
                    {ollamaPullLog ? (
                      <div className={`text-xs font-mono ${subtleTextClass}`}>{ollamaPullLog}</div>
                    ) : null}
                  </div>
                </section>

                <section className={`${sectionCardClass} space-y-4`}>
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    <h3 className="font-medium">Runtime settings</h3>
                  </div>

                  <div>
                    <label htmlFor="local-llm-url" className={sectionLabelClass}>Local LLM URL</label>
                    <input id="local-llm-url" value={localUrl} onChange={event => setLocalUrl(event.target.value)} className={textInputClass} />
                  </div>

                  <div>
                    <label htmlFor="history-retention-days" className={sectionLabelClass}>History retention (days)</label>
                    <input
                      id="history-retention-days"
                      type="number"
                      min="1"
                      max="3650"
                      value={historyRetentionDays}
                      onChange={event => setHistoryRetentionDays(event.target.value)}
                      placeholder="No limit"
                      className={textInputClass}
                    />
                    <p className={`mt-1 text-xs ${subtleTextClass}`}>History older than this many days is pruned when you save settings. Leave blank to keep everything.</p>
                  </div>

                  <div>
                    <label htmlFor="system-prompt" className={sectionLabelClass}>System prompt</label>
                    <textarea id="system-prompt" value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} onKeyDown={handleSystemPromptKeyDown} rows={6} className={textareaClass} />
                  </div>

                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4" />
                    <h3 className="font-medium">Google integration</h3>
                  </div>
                  <p className={`mb-4 text-sm ${subtleTextClass}`}>Connect your Google account to give Botty access to Calendar and Gmail. Create an OAuth 2.0 Client ID at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline">console.cloud.google.com</a>, enable the Calendar and Gmail APIs, and add <code className="font-mono text-xs">{window.location.origin}/api/google/callback</code> as an authorised redirect URI.</p>

                  {googleNotice ? (
                    <div className={`mb-3 px-3 py-2 rounded-lg text-sm ${googleNotice.includes('success') || googleNotice.includes('saved') ? (isDarkMode ? 'bg-emerald-500/10 border border-emerald-400/30 text-emerald-200' : 'bg-emerald-50 border border-emerald-200 text-emerald-800') : (isDarkMode ? 'bg-amber-500/10 border border-amber-400/30 text-amber-200' : 'bg-amber-50 border border-amber-200 text-amber-800')}`}>
                      {googleNotice}
                    </div>
                  ) : null}

                  {/* Connection status */}
                  <div className={`${elevatedCardClass} flex items-center justify-between gap-3 mb-3`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {googleStatus?.connected ? (
                        <Link className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Link2Off className={`w-4 h-4 shrink-0 ${subtleTextClass}`} />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {googleStatus?.connected ? 'Connected' : googleStatus?.credentialsConfigured ? 'Not connected' : 'Not configured'}
                        </div>
                        {googleStatus?.email ? (
                          <div className={`text-xs truncate ${subtleTextClass}`}>{googleStatus.email}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {googleStatus?.credentialsConfigured && !googleStatus.connected ? (
                        <button type="button" onClick={startGoogleOAuth} className={responsivePrimaryButtonClass}>
                          <Link className="w-4 h-4" />
                          Connect
                        </button>
                      ) : null}
                      {googleStatus?.connected ? (
                        <>
                          <button type="button" onClick={startGoogleOAuth} className={responsiveSecondaryButtonClass} title="Re-authorise to refresh permissions">
                            <RefreshCw className="w-4 h-4" />
                            Re-authorise
                          </button>
                          <button type="button" onClick={() => void disconnectGoogle()} className={`${responsiveSecondaryButtonClass} text-red-500 hover:text-red-600`}>
                            <Link2Off className="w-4 h-4" />
                            Disconnect
                          </button>
                        </>
                      ) : null}
                      <button type="button" onClick={() => void loadGoogleStatus()} className={responsiveSecondaryButtonClass} title="Refresh status">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Credentials input (always visible so user can update them) */}
                  <div className={`${elevatedCardClass} space-y-3`}>
                    <div className="text-sm font-medium">{googleStatus?.credentialsConfigured ? 'Update OAuth credentials' : 'Enter OAuth credentials'}</div>
                    <div>
                      <label htmlFor="google-client-id" className={`block text-xs mb-1 ${subtleTextClass}`}>Client ID</label>
                      <input
                        id="google-client-id"
                        type="text"
                        value={googleClientIdInput}
                        onChange={e => setGoogleClientIdInput(e.target.value)}
                        placeholder="123456789-abc...apps.googleusercontent.com"
                        className={textInputClass}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label htmlFor="google-client-secret" className={`block text-xs mb-1 ${subtleTextClass}`}>Client Secret</label>
                      <input
                        id="google-client-secret"
                        type="password"
                        value={googleClientSecretInput}
                        onChange={e => setGoogleClientSecretInput(e.target.value)}
                        placeholder="GOCSPX-..."
                        className={textInputClass}
                        autoComplete="new-password"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveGoogleCredentials()}
                      disabled={!googleClientIdInput.trim() || !googleClientSecretInput.trim() || googleCredentialsSaving}
                      className={responsivePrimaryButtonClass}
                    >
                      {googleCredentialsSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save credentials
                    </button>
                  </div>

                  {/* Feature list */}
                  {googleStatus?.connected ? (
                    <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${subtleTextClass} space-y-1`}>
                      <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> List and create Google Calendar events</div>
                      <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> Read and send Gmail messages</div>
                      <div className="opacity-70 mt-1">Ask the AI assistant to "show my calendar events" or "send an email to …" and it will use these tools.</div>
                    </div>
                  ) : null}
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <Bookmark className="w-4 h-4" />
                    <h3 className="font-medium">Prompt templates</h3>
                  </div>
                  <p className={`mb-4 text-sm ${subtleTextClass}`}>Save prompts you use frequently. Click a template in the composer to instantly fill the input field.</p>

                  {promptTemplates.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {promptTemplates.map(t => (
                        <div key={t.id} className={`${elevatedCardClass} flex items-start gap-3`}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{t.title}</div>
                            <div className={`text-xs mt-1 whitespace-pre-wrap break-words ${subtleTextClass}`}>{t.text}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void deletePromptTemplate(t.id)}
                            className={`shrink-0 ${subtleTextClass} hover:text-red-600`}
                            title="Delete template"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`mb-4 text-sm ${subtleTextClass}`}>No templates saved yet.</div>
                  )}

                  <div className={`${elevatedCardClass} flex flex-col gap-3`}>
                    <div className="text-sm font-medium">Add template</div>
                    <input
                      value={newTemplateTitle}
                      onChange={e => setNewTemplateTitle(e.target.value)}
                      placeholder="Template name, e.g. Code review checklist"
                      className={textInputClass}
                    />
                    <textarea
                      value={newTemplateText}
                      onChange={e => setNewTemplateText(e.target.value)}
                      rows={3}
                      placeholder="Template text, e.g. Review this code for bugs, performance issues, and security risks. List findings with severity."
                      className={textareaClass}
                    />
                    <button
                      type="button"
                      onClick={() => void savePromptTemplate(newTemplateTitle, newTemplateText)}
                      disabled={!newTemplateTitle.trim() || !newTemplateText.trim()}
                      className={responsivePrimaryButtonClass}
                    >
                      <Plus className="w-4 h-4" />
                      Save template
                    </button>
                  </div>
                </section>

                <section className={`${sectionCardClass} space-y-4`}>

                  <div className={`grid gap-4 lg:grid-cols-2 ${elevatedCardClass}`}>
                    <div className="lg:col-span-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="w-4 h-4" />
                        <h4 className="font-medium">Telegram bot</h4>
                      </div>
                      <p className={`text-sm ${subtleTextClass}`}>Save the bot token here and Botty will start or reload Telegram polling without editing environment files.</p>
                    </div>

                    <div className={`lg:col-span-2 rounded-[1rem] border px-4 py-3 ${telegramStatusToneClass}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-medium">{telegramStatusLabel}</div>
                          <div className="text-xs mt-1 opacity-90">{telegramStatusDetails}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void refreshTelegramStatus()}
                          className={responsiveSecondaryButtonClass}
                          disabled={loadingTelegramStatus}
                        >
                          <RefreshCw className={`w-4 h-4 ${loadingTelegramStatus ? 'animate-spin' : ''}`} />
                          Refresh
                        </button>
                        <button
                          type="button"
                          onClick={() => void sendTelegramTest()}
                          className={responsiveSecondaryButtonClass}
                          disabled={sendingTelegramTest}
                          title="Send a test message to all configured chat IDs"
                        >
                          <Send className={`w-4 h-4 ${sendingTelegramTest ? 'opacity-50' : ''}`} />
                          Test
                        </button>
                      </div>
                    </div>

                    {telegramTestResult ? (
                      <div className={`lg:col-span-2 rounded-[1rem] border px-4 py-3 text-sm ${telegramTestResult.ok ? (isDarkMode ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800') : (isDarkMode ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-800')}`}>
                        {telegramTestResult.message}
                      </div>
                    ) : null}

                    <div className="lg:col-span-2">
                      <label htmlFor="telegram-bot-token" className={sectionLabelClass}>Bot token</label>
                      <input
                        id="telegram-bot-token"
                        type="password"
                        value={telegramBotToken}
                        onChange={event => setTelegramBotToken(event.target.value)}
                        placeholder="1234567890:AA..."
                        className={textInputClass}
                      />
                    </div>

                    <label className={`flex items-start gap-3 rounded-[1rem] px-1 py-1 text-sm sm:items-center ${isDarkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                      <input type="checkbox" checked={telegramBotEnabled} onChange={event => setTelegramBotEnabled(event.target.checked)} />
                      <span>Enable Telegram bot polling</span>
                    </label>

                    <div>
                      <label htmlFor="telegram-allowed-chat-ids" className={sectionLabelClass}>Allowed chat IDs</label>
                      <input
                        id="telegram-allowed-chat-ids"
                        value={telegramAllowedChatIds}
                        onChange={event => setTelegramAllowedChatIds(event.target.value)}
                        placeholder="123456789,987654321"
                        className={textInputClass}
                      />
                    </div>

                    <div>
                      <label className={sectionLabelClass}>Daily digest</label>
                      <label className={`flex items-center gap-2 text-sm mt-1 cursor-pointer`}>
                        <input
                          type="checkbox"
                          checked={telegramDigestEnabled}
                          onChange={e => setTelegramDigestEnabled(e.target.checked)}
                        />
                        <span>Send a daily summary via Telegram</span>
                      </label>
                      {telegramDigestEnabled ? (
                        <div className="mt-2 flex items-center gap-2">
                          <label htmlFor="telegram-digest-hour" className={`text-xs ${mutedTextClass}`}>UTC hour (0–23):</label>
                          <input
                            id="telegram-digest-hour"
                            type="number"
                            min="0"
                            max="23"
                            value={telegramDigestHour}
                            onChange={e => setTelegramDigestHour(e.target.value)}
                            className={`${textInputClass} w-20`}
                          />
                        </div>
                      ) : null}
                    </div>

                  </div>

                  <label className={`flex items-start gap-3 rounded-[1rem] ${elevatedCardClass} text-sm sm:items-center`}>
                    <input type="checkbox" checked={useMemory} onChange={event => setUseMemory(event.target.checked)} />
                    <span>Include saved memory in prompt construction</span>
                  </label>

                  <label className={`flex items-start gap-3 rounded-[1rem] ${elevatedCardClass} text-sm sm:items-center`}>
                    <input type="checkbox" checked={autoMemory} onChange={event => setAutoMemory(event.target.checked)} />
                    <span>Learn durable facts about me automatically from successful chats</span>
                  </label>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <h3 className="font-medium">Skills</h3>
                    </div>
                    <button onClick={() => void clearFunctionPreset()} disabled={applyingFunctionId === 'clear'} className={secondaryButtonClass}>
                      {applyingFunctionId === 'clear' ? 'Clearing...' : 'Clear mode'}
                    </button>
                  </div>
                  <p className={`mb-4 text-sm ${subtleTextClass}`}>Activate via <code className="font-mono text-xs">/command</code> in the composer. Creating a skill sets it as the active chat mode.</p>
                  <form onSubmit={createCustomSkill} className="grid gap-3 md:grid-cols-2 mb-4">
                    <input value={newSkillTitle} onChange={event => patchNewSkill({ title: event.target.value })} placeholder="Skill title, e.g. Architecture Critic" className={textInputClass} />
                    <input value={newSkillCommand} onChange={event => patchNewSkill({ command: event.target.value })} placeholder="Slash command, e.g. architecture" className={textInputClass} />
                    <div className="md:col-span-2">
                      <input value={newSkillDescription} onChange={event => patchNewSkill({ description: event.target.value })} placeholder="Short description, e.g. critiques designs and tradeoffs" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newSkillSystemPrompt} onChange={event => patchNewSkill({ systemPrompt: event.target.value })} rows={3} placeholder="System prompt: define the expertise, decision rules, and tone for this skill" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2 flex">
                      <button type="submit" disabled={creatingFunction === 'skill'} className={responsivePrimaryButtonClass}>
                        {creatingFunction === 'skill' ? 'Adding...' : 'Add skill'}
                      </button>
                    </div>
                  </form>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {skillPresets.map(item => {
                      const isActive = activePresetId === item.id;
                      return (
                        <div key={item.id} className={`${elevatedCardClass} flex flex-col gap-3`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 min-w-0">
                              <Sparkles className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDarkMode ? 'text-violet-400' : 'text-violet-500'}`} />
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{item.title}</div>
                                <p className={`text-sm ${subtleTextClass} mt-1`}>{item.description}</p>
                              </div>
                            </div>
                            <div className={`shrink-0 rounded-full px-2 py-1 text-xs ${isActive ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200') : (isDarkMode ? 'bg-white/5 text-stone-300 border border-white/10' : 'bg-stone-100 text-stone-600 border border-stone-200')}`}>
                              {isActive ? 'Active' : `/${item.command}`}
                            </div>
                          </div>
                          <button
                            onClick={() => void activateFunctionPreset(item)}
                            disabled={applyingFunctionId === item.id}
                            className={responsivePrimaryButtonClass}
                          >
                            {applyingFunctionId === item.id ? 'Applying...' : 'Use in current chat'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <Bot className="w-4 h-4" />
                    <h3 className="font-medium">Agents</h3>
                  </div>
                  <p className={`mb-4 text-sm ${subtleTextClass}`}>Activate via <code className="font-mono text-xs">/command</code>. Agents own longer tasks and can have isolated memory.</p>

                  {/* Local agent discovery */}
                  <div className={`${elevatedCardClass} mb-4`}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <div className="text-sm font-medium">Discover local agents</div>
                        <div className={`text-xs mt-0.5 ${subtleTextClass}`}>Scans ports 7001–7099 for adapters exposing a <code className="font-mono">/health</code> endpoint with a Botty manifest.</div>
                      </div>
                      <button type="button" onClick={() => void handleScanLocalAgents()} disabled={localAgentScanning} className={`${responsiveSecondaryButtonClass} shrink-0 flex items-center gap-1.5`}>
                        <RefreshCw className={`w-3.5 h-3.5 ${localAgentScanning ? 'animate-spin' : ''}`} />
                        {localAgentScanning ? 'Scanning…' : 'Scan'}
                      </button>
                    </div>
                    {localAgentScanError ? (
                      <div className={`text-xs mt-1 ${subtleTextClass}`}>{localAgentScanError}</div>
                    ) : null}
                    {localAgentScanResults.length > 0 ? (
                      <div className="grid gap-2 mt-3">
                        {localAgentScanResults.map(agent => (
                          <div key={agent.port} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-stone-50 border border-stone-200'}`}>
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{agent.title}</div>
                              <div className={`text-xs truncate ${subtleTextClass}`}>:{agent.port} — {agent.description}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleAddLocalAgent(agent)}
                              disabled={addingLocalAgentPort === agent.port}
                              className={`${responsivePrimaryButtonClass} shrink-0`}
                            >
                              {addingLocalAgentPort === agent.port ? 'Adding…' : 'Add'}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <form onSubmit={createCustomBot} className="grid gap-3 md:grid-cols-2 mb-4">
                    <input value={newBotTitle} onChange={event => patchNewBot({ title: event.target.value })} placeholder="Agent title, e.g. Security Reviewer" className={textInputClass} />
                    <input value={newBotCommand} onChange={event => patchNewBot({ command: event.target.value })} placeholder="Slash command, e.g. security-review" className={textInputClass} />
                    <div className="md:col-span-2">
                      <input value={newBotDescription} onChange={event => patchNewBot({ description: event.target.value })} placeholder="Specialist summary, e.g. reviews code and architecture for security risk" className={textInputClass} />
                    </div>
                    <select value={newBotExecutorType} onChange={event => patchNewBot({ executorType: event.target.value as AgentExecutorType })} className={textInputClass}>
                      <option value="internal-llm">Internal Botty agent</option>
                      <option value="remote-http">Remote HTTP agent</option>
                      <option value="local-agent">Local agent (localhost)</option>
                    </select>
                    <input value={newBotEndpoint} onChange={event => patchNewBot({ endpoint: event.target.value })} placeholder="Endpoint, e.g. http://localhost:7001/botty" className={textInputClass} disabled={newBotExecutorType === 'internal-llm'} />
                    {newBotExecutorType === 'internal-llm' ? (
                      <>
                        <select value={newBotProvider ? getProviderSelectValue(newBotProvider) : ''} onChange={event => {
                          const nextProvider = event.target.value;
                          if (!nextProvider) { patchNewBot({ provider: '', model: '' }); return; }
                          if (nextProvider === 'auto') { patchNewBot({ provider: isAutoRouteProvider(newBotProvider) ? newBotProvider : 'auto', model: '' }); return; }
                          patchNewBot({ provider: nextProvider, model: getPreferredSelectableModel(nextProvider, '') });
                        }} className={textInputClass}>
                          <option value="">Inherit chat provider</option>
                          {PROVIDERS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <select value={newBotMemoryMode} onChange={event => patchNewBot({ memoryMode: event.target.value as 'shared' | 'isolated' | 'none' })} className={textInputClass}>
                          <option value="shared">Shared memory</option>
                          <option value="isolated">Isolated agent memory</option>
                          <option value="none">No memory</option>
                        </select>
                      </>
                    ) : (
                      <>
                        <div className={`${textInputClass} flex items-center ${subtleTextClass}`}>Routing handled by the remote endpoint</div>
                        <select value={newBotMemoryMode} onChange={event => patchNewBot({ memoryMode: event.target.value as 'shared' | 'isolated' | 'none' })} className={textInputClass}>
                          <option value="shared">Shared memory</option>
                          <option value="isolated">Isolated agent memory</option>
                          <option value="none">No memory</option>
                        </select>
                      </>
                    )}
                    <div className="md:col-span-2">
                      <select value={newBotProvider && isAutoRouteProvider(newBotProvider) ? newBotProvider : newBotModel} onChange={event => {
                        if (!newBotProvider) { patchNewBot({ model: event.target.value }); return; }
                        if (isAutoRouteProvider(newBotProvider)) { patchNewBot({ provider: event.target.value }); return; }
                        patchNewBot({ model: event.target.value });
                      }} disabled={!newBotProvider || newBotExecutorType !== 'internal-llm'} className={`${textInputClass} ${!newBotProvider || newBotExecutorType !== 'internal-llm' ? (isDarkMode ? 'disabled:bg-[#111927] disabled:text-stone-600' : 'disabled:bg-stone-100 disabled:text-stone-400') : ''}`}>
                        {!newBotProvider ? <option value="">Inherit provider default</option> : null}
                        {newBotProvider && isAutoRouteProvider(newBotProvider)
                          ? AUTO_ROUTE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)
                          : null}
                        {newBotProvider && !isAutoRouteProvider(newBotProvider) ? getSelectableModels(newBotProvider, newBotModel, true).map(option => (
                          <option key={option || '__default__'} value={option}>{formatModelOptionLabel(option, newBotProvider)}</option>
                        )) : null}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newBotSystemPrompt} onChange={event => patchNewBot({ systemPrompt: event.target.value })} rows={3} placeholder="System prompt: define the specialist role, operating rules, and decision standards" className={textareaClass} />
                    </div>
                    <div>
                      <input type="number" min="1" max="100" value={newBotMaxTurns} onChange={event => patchNewBot({ maxTurns: event.target.value })} placeholder="Max turns (optional, e.g. 10)" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2 flex">
                      <button type="submit" disabled={creatingFunction === 'agent'} className={responsivePrimaryButtonClass}>
                        {creatingFunction === 'agent' ? 'Adding...' : 'Add agent'}
                      </button>
                    </div>
                  </form>

                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium">Built-in agents</h4>
                    <span className={`text-xs ${subtleTextClass}`}>{builtInAgents.length} available</span>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2 mb-4">
                    {builtInAgents.map(item => {
                      const isActive = activePresetId === item.id;
                      return (
                        <div key={item.id} className={`${elevatedCardClass} flex flex-col gap-3`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 min-w-0">
                              <Bot className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDarkMode ? 'text-sky-400' : 'text-sky-500'}`} />
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{item.title}</div>
                                <p className={`text-sm ${subtleTextClass} mt-1`}>{item.description}</p>
                              </div>
                            </div>
                            <div className={`shrink-0 rounded-full px-2 py-1 text-xs ${isActive ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200') : (isDarkMode ? 'bg-white/5 text-stone-300 border border-white/10' : 'bg-stone-100 text-stone-600 border border-stone-200')}`}>
                              {isActive ? 'Active' : `/${item.command}`}
                            </div>
                          </div>
                          <button
                            onClick={() => void activateFunctionPreset(item, { startNewChat: true })}
                            disabled={applyingFunctionId === item.id}
                            className={responsivePrimaryButtonClass}
                          >
                            {applyingFunctionId === item.id ? 'Starting...' : 'Start agent chat'}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium">Custom agents</h4>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => importAgentInputRef.current?.click()} className={`text-xs ${subtleTextClass} hover:text-stone-700 dark:hover:text-stone-300`}>Import</button>
                      <input ref={importAgentInputRef} type="file" accept=".json,application/json" onChange={event => void importAgentsFromFile(event.target.files)} className="hidden" />
                      {customAgentsPresets.length > 0 ? (
                        <button type="button" onClick={exportAgents} className={`text-xs ${subtleTextClass} hover:text-stone-700 dark:hover:text-stone-300`}>Export all</button>
                      ) : null}
                      <span className={`text-xs ${subtleTextClass}`}>{customAgentsPresets.length} created</span>
                    </div>
                  </div>
                  {customAgentsPresets.length > 0 ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {customAgentsPresets.map(item => {
                        const isActive = activePresetId === item.id;
                        const isEditing = editingBotId === item.id;
                        const isSaving = savingBotId === item.id;
                        const isDeleting = deletingBotId === item.id;
                        const isConfirmingDelete = confirmingDeleteBotId === item.id;
                        return (
                          <div key={item.id} className={`${elevatedCardClass} flex flex-col gap-4`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium">{item.title}</div>
                                <p className={`text-sm ${subtleTextClass} mt-1`}>{item.description}</p>
                              </div>
                              <div className={`rounded-full px-2 py-1 text-xs ${isActive ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200') : (isDarkMode ? 'bg-white/5 text-stone-300 border border-white/10' : 'bg-stone-100 text-stone-600 border border-stone-200')}`}>
                                {isActive ? 'Active' : 'Custom agent'}
                              </div>
                            </div>
                            {isEditing ? (
                              <div className="grid gap-3 md:grid-cols-2">
                                <input value={editingBotTitle} onChange={event => patchEditingBot({ title: event.target.value })} placeholder="Agent title" className={textInputClass} />
                                <input value={editingBotCommand} onChange={event => patchEditingBot({ command: event.target.value })} placeholder="Slash command" className={textInputClass} />
                                <div className="md:col-span-2">
                                  <input value={editingBotDescription} onChange={event => patchEditingBot({ description: event.target.value })} placeholder="Specialist summary" className={textInputClass} />
                                </div>
                                <select value={editingBotExecutorType} onChange={event => patchEditingBot({ executorType: event.target.value as AgentExecutorType })} className={textInputClass}>
                                  <option value="internal-llm">Internal Botty agent</option>
                                  <option value="remote-http">Remote HTTP agent</option>
                                  <option value="local-agent">Local agent (localhost)</option>
                                </select>
                                <input value={editingBotEndpoint} onChange={event => patchEditingBot({ endpoint: event.target.value })} placeholder="Endpoint, e.g. http://localhost:7001/botty" className={textInputClass} disabled={editingBotExecutorType === 'internal-llm'} />
                                {editingBotExecutorType === 'internal-llm' ? (
                                  <>
                                    <select value={editingBotProvider ? getProviderSelectValue(editingBotProvider) : ''} onChange={event => {
                                      const nextProvider = event.target.value;
                                      if (!nextProvider) { patchEditingBot({ provider: '', model: '' }); return; }
                                      if (nextProvider === 'auto') { patchEditingBot({ provider: isAutoRouteProvider(editingBotProvider) ? editingBotProvider : 'auto', model: '' }); return; }
                                      patchEditingBot({ provider: nextProvider, model: getPreferredSelectableModel(nextProvider, '', editingBotModel) });
                                    }} className={textInputClass}>
                                      <option value="">Inherit chat provider</option>
                                      {PROVIDERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                    <select value={editingBotMemoryMode} onChange={event => patchEditingBot({ memoryMode: event.target.value as 'shared' | 'isolated' | 'none' })} className={textInputClass}>
                                      <option value="shared">Shared memory</option>
                                      <option value="isolated">Isolated agent memory</option>
                                      <option value="none">No memory</option>
                                    </select>
                                  </>
                                ) : (
                                  <>
                                    <div className={`${textInputClass} flex items-center ${subtleTextClass}`}>Routing handled by the remote endpoint</div>
                                    <select value={editingBotMemoryMode} onChange={event => patchEditingBot({ memoryMode: event.target.value as 'shared' | 'isolated' | 'none' })} className={textInputClass}>
                                      <option value="shared">Shared memory</option>
                                      <option value="isolated">Isolated agent memory</option>
                                      <option value="none">No memory</option>
                                    </select>
                                  </>
                                )}
                                <div className="md:col-span-2">
                                  <select value={editingBotProvider && isAutoRouteProvider(editingBotProvider) ? editingBotProvider : editingBotModel} onChange={event => {
                                    if (!editingBotProvider) { patchEditingBot({ model: event.target.value }); return; }
                                    if (isAutoRouteProvider(editingBotProvider)) { patchEditingBot({ provider: event.target.value }); return; }
                                    patchEditingBot({ model: event.target.value });
                                  }} disabled={!editingBotProvider || editingBotExecutorType !== 'internal-llm'} className={`${textInputClass} ${!editingBotProvider || editingBotExecutorType !== 'internal-llm' ? (isDarkMode ? 'disabled:bg-[#111927] disabled:text-stone-600' : 'disabled:bg-stone-100 disabled:text-stone-400') : ''}`}>
                                    {!editingBotProvider ? <option value="">Inherit provider default</option> : null}
                                    {editingBotProvider && isAutoRouteProvider(editingBotProvider)
                                      ? AUTO_ROUTE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)
                                      : null}
                                    {editingBotProvider && !isAutoRouteProvider(editingBotProvider) ? getSelectableModels(editingBotProvider, editingBotModel, true).map(option => (
                                      <option key={option || '__default__'} value={option}>{formatModelOptionLabel(option, editingBotProvider)}</option>
                                    )) : null}
                                  </select>
                                </div>
                                <div className="md:col-span-2">
                                  <textarea value={editingBotSystemPrompt} onChange={event => patchEditingBot({ systemPrompt: event.target.value })} rows={3} placeholder="System prompt" className={textareaClass} />
                                </div>
                                <div>
                                  <input type="number" min="1" max="100" value={editingBotMaxTurns} onChange={event => patchEditingBot({ maxTurns: event.target.value })} placeholder="Max turns" className={textInputClass} />
                                </div>
                                <div className="md:col-span-2">
                                  <div className="flex flex-col gap-2">
                                    <div className={`text-xs ${subtleTextClass}`}>Tool definitions (optional)</div>
                                    {editingBotTools.map((tool, idx) => (
                                      <div key={idx} className="flex gap-2 items-start">
                                        <input value={tool.name} onChange={event => patchEditingBot({ tools: editingBotTools.map((t, i) => i === idx ? { ...t, name: event.target.value } : t) })} placeholder="Tool name" className={textInputClass} />
                                        <input value={tool.description} onChange={event => patchEditingBot({ tools: editingBotTools.map((t, i) => i === idx ? { ...t, description: event.target.value } : t) })} placeholder="What this tool does" className={textInputClass} />
                                        <button type="button" onClick={() => patchEditingBot({ tools: editingBotTools.filter((_, i) => i !== idx) })} className={`shrink-0 ${secondaryButtonClass}`} aria-label="Remove tool">
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ))}
                                    <button type="button" onClick={() => patchEditingBot({ tools: [...editingBotTools, { name: '', description: '' }] })} className={secondaryButtonClass}>
                                      <Plus className="w-4 h-4" /> Add tool
                                    </button>
                                  </div>
                                </div>
                                <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                  <button type="button" onClick={() => void saveEditedCustomBot(item.id)} disabled={isSaving} className={responsivePrimaryButtonClass}>
                                    <Save className="w-4 h-4" />
                                    {isSaving ? 'Saving...' : 'Save changes'}
                                  </button>
                                  <button type="button" onClick={stopEditingCustomBot} disabled={isSaving} className={responsiveSecondaryButtonClass}>Cancel</button>
                                  <button type="button" onClick={() => void deleteCustomBot(item)} disabled={isSaving || isDeleting} className={responsiveDestructiveButtonClass}>
                                    <Trash2 className="w-4 h-4" />
                                    {isDeleting ? 'Deleting...' : 'Delete agent'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className={`text-xs ${subtleTextClass} flex flex-wrap gap-x-3 gap-y-1`}>
                                  {item.provider ? <span>{formatProviderLabel(item.provider)}{item.model ? ` · ${formatModelDisplay(item.model, item.provider)}` : ''}</span> : null}
                                  <span>Memory: {item.memoryMode || 'shared'}</span>
                                  {getAgentExecutorLabel(item) !== 'Internal Botty agent' ? <span>{getAgentExecutorLabel(item)}</span> : null}
                                  {getAgentEndpoint(item) ? <span className="truncate max-w-[200px]">Endpoint: {getAgentEndpoint(item)}</span> : null}
                                </div>
                                {isConfirmingDelete ? (
                                  <div className={`rounded-[1rem] border px-3 py-3 text-sm ${isDarkMode ? 'border-red-900/60 bg-red-950/20 text-red-200' : 'border-red-200 bg-red-50 text-red-800'}`}>
                                    Delete this custom agent?{isActive ? ' It is currently active, so Botty will clear the active agent mode after deletion.' : ''}
                                  </div>
                                ) : null}
                                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                  <button onClick={() => void activateFunctionPreset(item, { startNewChat: true })} disabled={applyingFunctionId === item.id || isConfirmingDelete} className={responsivePrimaryButtonClass}>
                                    {applyingFunctionId === item.id ? 'Starting...' : 'Start agent chat'}
                                  </button>
                                  <button onClick={() => void activateFunctionPreset(item)} disabled={applyingFunctionId === item.id || isConfirmingDelete} className={responsiveSecondaryButtonClass}>
                                    {applyingFunctionId === item.id ? 'Starting...' : 'Use in current chat'}
                                  </button>
                                  <button type="button" onClick={() => startEditingCustomBot(item)} disabled={isDeleting || isConfirmingDelete} className={responsiveSecondaryButtonClass}>Edit agent</button>
                                  {isConfirmingDelete ? (
                                    <>
                                      <button type="button" onClick={() => void deleteCustomBot(item)} disabled={isDeleting} className={responsiveDestructiveButtonClass}>
                                        <Trash2 className="w-4 h-4" />
                                        {isDeleting ? 'Deleting...' : 'Confirm delete'}
                                      </button>
                                      <button type="button" onClick={cancelDeleteCustomBot} disabled={isDeleting} className={responsiveSecondaryButtonClass}>Cancel delete</button>
                                    </>
                                  ) : (
                                    <button type="button" onClick={() => requestDeleteCustomBot(item.id)} disabled={isDeleting} className={responsiveDestructiveButtonClass}>
                                      <Trash2 className="w-4 h-4" />
                                      Delete agent
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={`text-sm ${subtleTextClass}`}>No custom agents yet.</div>
                  )}
                  <div className="mt-4 pt-4 border-t border-current/10">
                    <button onClick={() => void saveSettings()} disabled={savingSettings} className={responsivePrimaryButtonClass}>
                      <Save className="w-4 h-4" />
                      {savingSettings ? 'Saving...' : 'Save settings'}
                    </button>
                  </div>
                </section>
              </div>
  );
}
