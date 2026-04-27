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
export default function ChatPanel() {
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
    scrollLockedRef, apiSend,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useAppContext() as Record<string, any>;

  return (
              <div className={`grid flex-1 min-h-0 gap-3 sm:gap-4 ${isFullscreen ? 'grid-cols-1 overflow-hidden' : 'xl:grid-cols-[minmax(0,1fr)_320px]'}`}>
                <section className={`${sectionCardClass} flex min-h-0 flex-col ${isFullscreen ? 'h-full' : 'min-h-[62vh] sm:min-h-[70vh] lg:min-h-0'}`}>
                  {activePreset ? (
                    <div className={`mb-3 flex flex-col gap-2 rounded-[1rem] border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
                      activePreset.kind === 'skill'
                        ? (isDarkMode ? 'border-amber-400/20 bg-amber-500/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900')
                        : (isDarkMode ? 'border-violet-400/20 bg-violet-500/10 text-violet-100' : 'border-violet-200 bg-violet-50 text-violet-900')
                    }`}>
                      <div className="flex items-start gap-2">
                        {activePreset.kind === 'skill'
                          ? <Sparkles className="mt-0.5 w-4 h-4 shrink-0" />
                          : <Bot className="mt-0.5 w-4 h-4 shrink-0" />}
                        <div>
                          <div className="font-medium">{activePreset.kind === 'skill' ? 'Skill overlay' : 'Agent session'}: {activePreset.title}</div>
                          <div className={`mt-1 text-xs opacity-80`}>
                            {activePreset.kind === 'skill'
                              ? 'Inherits the current provider, memory, and session — does not take over the workflow.'
                              : 'Owns the session. May apply its own routing, model, and memory policy.'}
                          </div>
                          {activeBotPreset?.tools?.length ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {activeBotPreset.tools.map(tool => (
                                <span key={tool.name} className={`rounded-full border px-2 py-0.5 text-[11px] tracking-wide opacity-80 ${isDarkMode ? 'border-violet-400/20 bg-violet-500/10' : 'border-violet-200 bg-violet-100'}`}>
                                  {tool.name}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <button onClick={() => void clearFunctionPreset()} disabled={applyingFunctionId === 'clear'} className={secondaryButtonClass}>
                        {applyingFunctionId === 'clear' ? 'Clearing...' : 'Clear mode'}
                      </button>
                    </div>
                  ) : null}

                  <div className={`items-center justify-between gap-3 pb-3 xl:hidden ${isFullscreen ? 'hidden' : 'flex'}`}>
                    <div>
                      <h3 className="text-sm font-medium">Runtime</h3>
                      <p className={`mt-1 text-xs ${subtleTextClass}`}>Toggle runtime details.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        title="Search messages (Ctrl+F)"
                        onClick={() => setShowChatSearch(v => !v)}
                        className={`${secondaryButtonClass} ${showChatSearch ? (isDarkMode ? 'bg-amber-500/15 border-amber-400/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800') : ''}`}
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsChatSidebarOpen(value => !value)}
                        className={secondaryButtonClass}
                        aria-expanded={isChatSidebarOpen}
                        aria-label={isChatSidebarOpen ? 'Hide runtime details' : 'Show runtime details'}
                      >
                        {isChatSidebarOpen ? 'Hide runtime' : 'Show runtime'}
                      </button>
                    </div>
                  </div>

                  <div ref={chatScrollRef} className="flex-1 overflow-auto space-y-3 pr-1 sm:space-y-4 sm:pr-2 relative">
                    {showChatSearch ? (
                      <div className={`sticky top-0 z-10 flex items-center gap-2 rounded-xl border px-3 py-2 mb-2 ${isDarkMode ? 'bg-[#1a1d20] border-white/10' : 'bg-white border-stone-200'}`}>
                        <Search className="w-3.5 h-3.5 shrink-0 opacity-50" />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search messages…"
                          value={chatSearch}
                          onChange={e => setChatSearch(e.target.value)}
                          className="flex-1 bg-transparent text-sm outline-none"
                        />
                        {chatSearch ? (
                          <span className={`text-xs ${isDarkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                            {messages.filter(m => m.content.toLowerCase().includes(chatSearch.toLowerCase())).length} match(es)
                          </span>
                        ) : null}
                        <button type="button" onClick={() => { setShowChatSearch(false); setChatSearch(''); }} className="opacity-50 hover:opacity-100">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : null}
                    {showScrollResumeBtn ? (
                      <div className="sticky top-0 z-10 flex justify-center pb-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            scrollLockedRef.current = false;
                            setShowScrollResumeBtn(false);
                            const el = chatScrollRef.current;
                            if (el) el.scrollTop = el.scrollHeight;
                          }}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs shadow-md ${isDarkMode ? 'bg-stone-700 text-stone-100 hover:bg-stone-600' : 'bg-stone-800 text-white hover:bg-stone-700'}`}
                        >
                          ↓ Resume scroll
                        </button>
                      </div>
                    ) : null}
                    {conversationTokenWarning ? (
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${conversationTokenWarning.level === 'critical' ? (isDarkMode ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-800') : (isDarkMode ? 'border-amber-400/20 bg-amber-500/8 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800')}`}>
                        <Layers className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span>
                          Context is {Math.round(conversationTokenWarning.pct * 100)}% full ({conversationTokenWarning.totalUsed.toLocaleString()} / {conversationTokenWarning.limit.toLocaleString()} tokens). Consider starting a new chat or using /new-chat.
                        </span>
                      </div>
                    ) : null}
                    {messages.length === 0 ? (
                      <div className={`h-full min-h-[360px] flex items-center justify-center ${emptyStateClass}`}>
                        <div className="max-w-md text-center">
                          <Bot className={`w-10 h-10 mx-auto mb-3 ${isDarkMode ? 'text-stone-500' : 'text-stone-400'}`} />
                          <p className={`text-lg ${isDarkMode ? 'text-stone-200' : 'text-stone-700'}`}>Start a local conversation.</p>
                          <p className="text-sm mt-2 max-w-md">Choose a provider, type naturally, or use slash to jump modes without leaving the composer.</p>
                        </div>
                      </div>
                    ) : null}

                    {messages.map((message, index) => (
                      message.isCompact && message.role === 'user' ? (
                        <div key={`compact-${index}`} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${isDarkMode ? 'border-amber-400/20 bg-amber-500/8 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                          <div className="text-xs leading-relaxed opacity-80">
                            {message.content.replace('[Context from earlier in this conversation]: ', '')}
                          </div>
                        </div>
                      ) : message.isCompact ? null : (
                      <div key={`${message.role}-${index}`} className={`rounded-[1.1rem] px-3 py-3 sm:px-4 sm:py-4 ${message.role === 'user' ? (isDarkMode ? 'bg-white text-stone-950 ml-auto max-w-[94%] sm:max-w-[82%]' : 'bg-stone-900 text-white ml-auto max-w-[94%] sm:max-w-[82%]') : isDarkMode ? 'bg-[#1a1d20] border border-white/8 max-w-full sm:max-w-[92%]' : 'bg-[#f7f4ee] border border-stone-200 max-w-full sm:max-w-[92%]'} ${chatSearch.trim() && message.content.toLowerCase().includes(chatSearch.toLowerCase()) ? (isDarkMode ? 'ring-2 ring-amber-400/60' : 'ring-2 ring-amber-400') : ''}`}>
                        <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-2">
                          {message.role === 'user'
                            ? 'You'
                            : [formatProviderLabel(message.provider), message.model].filter(Boolean).join(' · ') || message.model || 'Assistant'}
                          {message.role === 'assistant' && message.routingMode ? (
                            <span className="ml-2 lowercase tracking-normal opacity-60 not-italic font-normal" style={{ fontSize: '0.68rem' }}>
                              ({message.routingMode})
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[15px] leading-6 sm:leading-7">
                          {message.role === 'assistant'
                            ? <MarkdownMessage content={message.content} isDark={isDarkMode} />
                            : <span className="whitespace-pre-wrap">{message.content}</span>
                          }
                        </div>
                        {message.role === 'assistant' && message.ragSources?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {message.ragSources.map(src => (
                              <span key={src} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${isDarkMode ? 'bg-white/8 text-stone-300 border border-white/10' : 'bg-stone-100 text-stone-600 border border-stone-200'}`}>
                                <FileText className="w-3 h-3 shrink-0" />
                                {src}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {message.role === 'assistant' && message.toolSteps?.length ? (
                          <div className={`mt-2 flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${isDarkMode ? 'bg-white/5 border border-white/8' : 'bg-stone-100 border border-stone-200'}`}>
                            <span className={`shrink-0 font-medium ${isDarkMode ? 'text-stone-400' : 'text-stone-500'}`}>Tools used:</span>
                            {message.toolSteps.map(step => (
                              <span key={step} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${isDarkMode ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                                <MemoryStick className="w-3 h-3 shrink-0" />
                                {step}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {message.role === 'user' && !isSending ? (
                          <div className="mt-2 flex justify-start">
                            <button
                              type="button"
                              title="Fork — branch from this point"
                              onClick={() => {
                                dispatchChat({ type: 'FORK_AT', beforeIndex: index });
                                setPrompt(message.content);
                              }}
                              className={`flex items-center gap-1 text-xs ${subtleTextClass} opacity-50 hover:opacity-100`}
                            >
                              <GitBranch className="w-3 h-3" /> Fork
                            </button>
                          </div>
                        ) : null}
                        {message.role === 'assistant' ? (
                          <div className="mt-2 flex flex-col gap-2">
                            {/* Memory suggestion inline panel */}
                            {memorySuggestion?.messageIndex === index ? (
                              <div className={`rounded-lg border px-3 py-2 text-xs ${isDarkMode ? 'border-amber-400/30 bg-amber-500/8 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                {memorySuggestion.loading ? (
                                  <span className="opacity-70">Extracting memorable fact…</span>
                                ) : memorySuggestion.saved ? (
                                  <span className="flex items-center gap-1.5"><Check className="w-3 h-3" /> Saved to memory.</span>
                                ) : memorySuggestion.suggestions.length === 0 ? (
                                  <span className="opacity-70">Nothing memorable found in this message.</span>
                                ) : (
                                  <div className="flex flex-col gap-1.5">
                                    {memorySuggestion.suggestions.map((s, si) => (
                                      <div key={si} className="flex items-start justify-between gap-2">
                                        <span>📌 {s}</span>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            try {
                                              await apiSend('/api/memory/facts', 'POST', { content: s });
                                              setMemorySuggestion(prev => prev ? { ...prev, saved: true } : null);
                                              setTimeout(() => setMemorySuggestion(null), 2000);
                                            } catch {
                                              setMemorySuggestion(null);
                                            }
                                          }}
                                          className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
                                        >Save</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {!memorySuggestion.loading && !memorySuggestion.saved ? (
                                  <button type="button" onClick={() => setMemorySuggestion(null)} className="mt-1 opacity-50 hover:opacity-100">Dismiss</button>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="flex items-center justify-end gap-2">
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  title="Pin a fact to memory"
                                  onClick={async () => {
                                    setMemorySuggestion({ messageIndex: index, suggestions: [], loading: true, saved: false });
                                    try {
                                      const prevUser = messages.slice(0, index).reverse().find(m => m.role === 'user');
                                      const data = await (apiSend as <T>(path: string, method: string, body?: unknown) => Promise<T>)<{ suggestions: string[] }>('/api/memory/suggest', 'POST', {
                                        assistantContent: message.content,
                                        userPrompt: prevUser?.content,
                                      });
                                      setMemorySuggestion({ messageIndex: index, suggestions: data?.suggestions ?? [], loading: false, saved: false });
                                    } catch {
                                      setMemorySuggestion({ messageIndex: index, suggestions: [], loading: false, saved: false });
                                    }
                                  }}
                                  className={`flex items-center gap-1 text-xs ${subtleTextClass} opacity-50 hover:opacity-100 transition-opacity`}
                                >
                                  <Pin className="w-3 h-3" /> Remember
                                </button>
                                <button
                                  type="button"
                                  title="Copy message"
                                  onClick={() => {
                                    navigator.clipboard.writeText(message.content);
                                    setCopiedMessageIndex(index);
                                    setTimeout(() => setCopiedMessageIndex(null), 1500);
                                  }}
                                  className={`flex items-center gap-1 text-xs ${subtleTextClass} opacity-50 hover:opacity-100 transition-opacity`}
                                >
                                  {copiedMessageIndex === index ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                  {copiedMessageIndex === index ? 'Copied!' : 'Copy'}
                                </button>
                                {message.model && index === messages.length - 1 && !isSending ? (
                                  <button
                                    type="button"
                                    title="Retry — resend the last message"
                                    onClick={() => {
                                      const lastUser = [...messages].reverse().find(m => m.role === 'user');
                                      if (!lastUser) return;
                                      dispatchChat({ type: 'ROLLBACK_OPTIMISTIC' });
                                      setPrompt(lastUser.content);
                                    }}
                                    className={`flex items-center gap-1 text-xs ${subtleTextClass} hover:text-stone-700 dark:hover:text-stone-300`}
                                  >
                                    <RefreshCw className="w-3 h-3" /> Retry
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      )
                    ))}
                  </div>

                  {chatError ? <div className="mt-4 rounded-[1rem] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{chatError}</div> : null}

                  <div ref={composerDropRef} className={`relative mt-4 rounded-[1.25rem] p-2.5 sm:p-3 transition-colors ${isDarkMode ? 'border border-white/8 bg-[#111417]' : 'border border-stone-200 bg-[#faf8f3]'} ${isDragOverComposer ? (isDarkMode ? 'ring-2 ring-white/30 bg-[#1b2024]' : 'ring-2 ring-stone-400/60 bg-white') : ''}`}>
                    {isDragOverComposer ? (
                      <div className={`pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-[1.1rem] border-2 border-dashed ${isDarkMode ? 'border-white/25 bg-[#111417]/92 text-stone-100' : 'border-stone-300 bg-white/92 text-stone-900'}`}>
                        <div className="text-center">
                          <Upload className="mx-auto h-8 w-8" />
                          <p className="mt-3 text-base font-medium">Drop files to attach</p>
                          <p className="mt-1 text-sm opacity-75">Text, PDF, and image files are supported.</p>
                        </div>
                      </div>
                    ) : null}
                    <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,180px)_1fr_auto]">
                      <select
                        value={getProviderSelectValue(provider)}
                        onChange={event => {
                          const nextProvider = event.target.value;
                          if (nextProvider === 'auto') {
                            setProvider(currentProvider => isAutoRouteProvider(currentProvider) ? currentProvider : 'auto');
                            setModel('');
                            return;
                          }

                          setProvider(nextProvider);
                          setModel(getPreferredSelectableModel(nextProvider, prompt));
                        }}
                        className={inputClass}
                      >
                        {PROVIDERS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>

                      <select
                        value={isAutoRouteProvider(provider) ? provider : model}
                        onChange={event => {
                          if (isAutoRouteProvider(provider)) {
                            setProvider(event.target.value);
                            return;
                          }

                          setModel(event.target.value);
                        }}
                        className={inputClass}
                      >
                        {isAutoRouteProvider(provider)
                          ? AUTO_ROUTE_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))
                          : getSelectableModels(provider, model).map(option => (
                              <option key={option} value={option}>{formatModelOptionLabel(option, provider)}</option>
                            ))}
                      </select>

                      <button
                        type="button"
                        title="Refresh model catalog"
                        onClick={() => void refreshModels()}
                        disabled={isRefreshingModels}
                        className={`flex items-center justify-center rounded-lg px-3 py-2 text-sm transition-opacity ${isDarkMode ? 'bg-white/10 hover:bg-white/20 text-stone-300' : 'bg-stone-100 hover:bg-stone-200 text-stone-600'} disabled:opacity-40`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`h-4 w-4 ${isRefreshingModels ? 'animate-spin' : ''}`}
                        >
                          <path d="M23 4v6h-6" />
                          <path d="M1 20v-6h6" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                          <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                        </svg>
                      </button>
                    </div>

                    {conversationId && conversationModels[conversationId] ? (
                      <div className={`mb-2 flex items-center gap-1.5 text-xs ${subtleTextClass}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <span>Locked to <strong>{[conversationModels[conversationId].provider, conversationModels[conversationId].model].filter(Boolean).join(' · ')}</strong> for this conversation</span>
                      </div>
                    ) : null}

                    <textarea
                      ref={composerTextareaRef}
                      value={prompt}
                      onChange={event => setPrompt(event.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      rows={4}
                      placeholder="Ask Claude to debug, design, or write code... Use /development for skills or /new-chat for commands"
                      className={textareaClass}
                    />

                    {interimTranscript ? (
                      <p className={`mt-1 px-1 text-xs italic ${subtleTextClass}`}>{interimTranscript}…</p>
                    ) : null}

                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      accept="text/*,.txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.xml,.yml,.yaml,.py,.java,.c,.cpp,.rs,.go,.sh,.sql,.log,.pdf,image/*"
                      onChange={event => void addChatFiles(event.target.files)}
                      className="hidden"
                    />

                    {pendingAttachments.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pendingAttachments.map(item => (
                          <div key={item.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs ${isDarkMode ? 'bg-white/10 text-stone-200 border border-white/10' : 'bg-stone-100 text-stone-700 border border-stone-200'}`}>
                            <span>{item.name}</span>
                            <button type="button" onClick={() => removePendingAttachment(item.id)} className="opacity-80 hover:opacity-100">×</button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {prompt.startsWith('/') ? (
                      <div className={`mt-3 rounded-[1rem] border ${isDarkMode ? 'border-white/8 bg-[#1a1d20]' : 'border-stone-200 bg-white'} p-2`}>
                        <div className="flex items-center justify-between gap-3 px-2 pb-2">
                          <div className={`text-xs ${subtleTextClass}`}>Slash autocomplete</div>
                          <div className={`text-[11px] ${subtleTextClass}`}>Arrow keys to move, Enter to apply, Esc to keep text</div>
                        </div>
                        <div className="space-y-3">
                          {slashMenuItems.length > 0 ? (
                            <>
                              {groupedSlashItems.recent.length > 0 ? (
                                <div>
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Recent</div>
                                  <div className="space-y-1">
                                    {groupedSlashItems.recent.map(item => {
                                      const index = slashMenuItems.findIndex(candidate => candidate.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() => void activateSlashItem(item)}
                                          className={`w-full rounded-xl px-3 py-2 text-left ${getSlashItemPanelClass(index === selectedSlashIndex)}`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="text-sm font-medium">/{item.command}</div>
                                              <div className={`text-xs mt-1 ${subtleTextClass}`}>{item.description}</div>
                                              {item.detail ? <div className={`text-[11px] mt-2 ${subtleTextClass}`}>{item.detail}</div> : null}
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                              <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getSlashItemBadgeClass(item)}`}>{item.badge}</span>
                                              <div className={`text-xs ${subtleTextClass}`}>{item.title}</div>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {groupedSlashItems.commands.length > 0 ? (
                                <div>
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Navigation</div>
                                  <div className="space-y-1">
                                    {groupedSlashItems.commands.map(item => {
                                      const index = slashMenuItems.findIndex(candidate => candidate.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() => void activateSlashItem(item)}
                                          className={`w-full rounded-xl px-3 py-2 text-left ${getSlashItemPanelClass(index === selectedSlashIndex)}`}
                                        >
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className={`text-xs ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>→</span>
                                              <div>
                                                <span className="text-sm font-medium">/{item.command}</span>
                                                <span className={`ml-2 text-xs ${subtleTextClass}`}>{item.description}</span>
                                              </div>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getSlashItemBadgeClass(item)}`}>{item.badge}</span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {groupedSlashItems.skills.length > 0 ? (
                                <div>
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Skills</div>
                                  <div className="space-y-1">
                                    {groupedSlashItems.skills.map(item => {
                                      const index = slashMenuItems.findIndex(candidate => candidate.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() => void activateSlashItem(item)}
                                          className={`w-full rounded-xl px-3 py-2 text-left ${getSlashItemPanelClass(index === selectedSlashIndex)}`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="text-sm font-medium">/{item.command}</div>
                                              <div className={`text-xs mt-1 ${subtleTextClass}`}>{item.description}</div>
                                              {item.detail ? <div className={`text-[11px] mt-2 ${subtleTextClass}`}>{item.detail}</div> : null}
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                              <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getSlashItemBadgeClass(item)}`}>{item.badge}</span>
                                              <div className={`text-xs ${subtleTextClass}`}>{item.title}</div>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {groupedSlashItems.agents.length > 0 ? (
                                <div>
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Agents</div>
                                  <div className="space-y-1">
                                    {groupedSlashItems.agents.map(item => {
                                      const index = slashMenuItems.findIndex(candidate => candidate.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() => void activateSlashItem(item)}
                                          className={`w-full rounded-xl px-3 py-2 text-left ${getSlashItemPanelClass(index === selectedSlashIndex)}`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="text-sm font-medium">/{item.command}</div>
                                              <div className={`text-xs mt-1 ${subtleTextClass}`}>{item.description}</div>
                                              {item.detail ? <div className={`text-[11px] mt-2 ${subtleTextClass}`}>{item.detail}</div> : null}
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                              <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getSlashItemBadgeClass(item)}`}>{item.badge}</span>
                                              <div className={`text-xs ${subtleTextClass}`}>{item.title}</div>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className={`px-3 py-2 text-sm ${subtleTextClass}`}>No matching commands, skills, or agents.</div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <p className={`text-xs ${subtleTextClass}`}>Memory: {useMemory ? 'on' : 'off'}. Sandbox: {sandboxMode ? 'on' : 'off'}.{webSearchEnabled ? ' Web search: on.' : ''}{activePresetId ? ` Mode: ${allPresets.find(item => item.id === activePresetId)?.title || 'Custom'}.` : ''}</p>
                      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                        <button type="button" onClick={() => attachmentInputRef.current?.click()} className={secondaryButtonClass}>
                          <Upload className="w-4 h-4" />
                          Add files
                        </button>
                        <button
                          type="button"
                          onClick={() => setWebSearchEnabled(v => !v)}
                          title={webSearchEnabled ? 'Web search on — click to disable' : 'Enable web search (requires TAVILY_API_KEY)'}
                          className={`${secondaryButtonClass}${webSearchEnabled ? (isDarkMode ? ' bg-blue-500/15 text-blue-300 border-blue-500/30' : ' bg-blue-100 text-blue-700 border-blue-300') : ''}`}
                        >
                          <Globe className="w-4 h-4" />
                          {webSearchEnabled ? 'Search on' : 'Search'}
                        </button>
                        {ragDocuments.length > 0 ? (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowRagDocMenu(v => !v)}
                              title={attachedRagDoc ? `Doc: ${attachedRagDoc}` : 'Attach a document for context'}
                              className={`${secondaryButtonClass}${attachedRagDoc ? (isDarkMode ? ' bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : ' bg-emerald-100 text-emerald-700 border-emerald-300') : ''}`}
                            >
                              <FileText className="w-4 h-4" />
                              {attachedRagDoc ? attachedRagDoc.slice(0, 12) + (attachedRagDoc.length > 12 ? '\u2026' : '') : 'Doc'}
                            </button>
                            {showRagDocMenu ? (
                              <div className={`absolute bottom-full right-0 mb-2 z-50 w-64 rounded-[1rem] border shadow-lg ${isDarkMode ? 'bg-[#1a1d20] border-white/10' : 'bg-white border-stone-200'}`}>
                                <div className="p-3">
                                  <div className={`text-xs font-medium mb-2 ${subtleTextClass}`}>Pick a document</div>
                                  {attachedRagDoc ? (
                                    <button type="button" onClick={() => { setAttachedRagDoc(''); setShowRagDocMenu(false); }} className={`w-full rounded-xl px-3 py-2 text-sm text-left mb-1 ${isDarkMode ? 'hover:bg-white/8 text-red-300' : 'hover:bg-red-50 text-red-600'}`}>
                                      ✕ Remove document
                                    </button>
                                  ) : null}
                                  {ragDocuments.map(doc => (
                                    <button key={doc.name} type="button"
                                      onClick={() => { setAttachedRagDoc(doc.name); setShowRagDocMenu(false); }}
                                      className={`w-full rounded-xl px-3 py-2 text-left text-sm ${attachedRagDoc === doc.name ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-50 text-emerald-800') : (isDarkMode ? 'hover:bg-white/8 text-stone-200' : 'hover:bg-stone-100 text-stone-800')}`}
                                    >
                                      <div className="font-medium truncate">{doc.name}</div>
                                      <div className={`text-xs truncate mt-0.5 ${subtleTextClass}`}>{doc.chunks} chunks</div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowTemplatesMenu(v => !v)}
                            title="Prompt templates"
                            className={`${secondaryButtonClass}${showTemplatesMenu ? (isDarkMode ? ' bg-amber-500/15 text-amber-300 border-amber-500/30' : ' bg-amber-100 text-amber-700 border-amber-300') : ''}`}
                          >
                            <Bookmark className="w-4 h-4" />
                            Templates
                          </button>
                          {showTemplatesMenu ? (
                            <div className={`absolute bottom-full right-0 mb-2 z-50 w-72 rounded-[1rem] border shadow-lg ${isDarkMode ? 'bg-[#1a1d20] border-white/10' : 'bg-white border-stone-200'}`}>
                              <div className="p-3">
                                <div className={`text-xs font-medium mb-2 ${subtleTextClass}`}>Prompt templates</div>
                                {promptTemplates.length === 0 ? (
                                  <div className={`text-xs ${mutedTextClass} mb-2`}>No templates saved. Add one in Settings.</div>
                                ) : (
                                  <div className="space-y-1 mb-2 max-h-52 overflow-y-auto">
                                    {promptTemplates.map(t => (
                                      <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => applyPromptTemplate(t.text)}
                                        className={`w-full rounded-xl px-3 py-2 text-left text-sm ${isDarkMode ? 'hover:bg-white/8 text-stone-200' : 'hover:bg-stone-100 text-stone-800'}`}
                                      >
                                        <div className="font-medium truncate">{t.title}</div>
                                        <div className={`text-xs truncate mt-0.5 ${subtleTextClass}`}>{t.text}</div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => { setShowTemplatesMenu(false); setActiveTab('settings'); }}
                                  className={`w-full rounded-xl px-3 py-1.5 text-xs text-left ${isDarkMode ? 'text-stone-400 hover:text-stone-200' : 'text-stone-500 hover:text-stone-800'}`}
                                >
                                  Manage templates in Settings →
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <button type="button" onClick={toggleVoiceInput} className={`${secondaryButtonClass}${isListening ? ' mic-listening' : ''}`}>
                          {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                          {isListening ? 'Stop' : 'Voice'}
                        </button>
                        {isSending ? (
                          <button type="button" onClick={stopCurrentResponse} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-white sm:w-auto">
                            <Square className="w-4 h-4" />
                            Stop
                          </button>
                        ) : (
                          <button onClick={() => void sendPrompt()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-white disabled:opacity-60 sm:w-auto">
                            <Send className="w-4 h-4" />
                            Send
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className={`${isChatSidebarOpen || isFullscreen ? 'space-y-4' : 'hidden'} ${isFullscreen ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-2' : ''} xl:block`}>
                  <div className={sectionCardClass}>
                    <h3 className="font-medium">Current runtime</h3>
                    <ul className={`mt-3 text-sm ${mutedTextClass} space-y-2`}>
                      <li>Primary provider: {currentRuntimeProvider}</li>
                      <li>Model: {formatModelDisplay(currentRuntimeModel, currentRuntimeProvider)}</li>
                      <li>{currentRuntimeTokenUsage || `Estimated token window: ${getEstimatedModelTokenLimit(currentRuntimeProvider, currentRuntimeModel)?.toLocaleString() || 'unknown'}`}</li>
                      <li>Available providers: {availableProviders.length ? availableProviders.join(', ') : 'none'}</li>
                    </ul>
                  </div>

                  <div className={sectionCardClass}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 opacity-60" />
                        <h3 className="font-medium">Session system prompt</h3>
                      </div>
                      {sessionSystemPrompt.trim() ? (
                        <button type="button" onClick={() => setSessionSystemPrompt('')} className={`text-xs ${subtleTextClass} opacity-60 hover:opacity-100`}>Clear</button>
                      ) : null}
                    </div>
                    <p className={`text-xs ${mutedTextClass} mb-2`}>Appended to the system prompt on every send. Use it to set a tone, persona, or extra instructions for this session.</p>
                    <textarea
                      value={sessionSystemPrompt}
                      onChange={e => setSessionSystemPrompt(e.target.value)}
                      rows={5}
                      placeholder={`e.g. Always reply concisely in bullet points.\nFocus on performance and security tradeoffs.`}
                      className={`w-full resize-y text-xs ${isDarkMode ? 'bg-white/5 border-white/10 text-stone-200 placeholder:text-stone-500' : 'bg-stone-50 border-stone-200 text-stone-800 placeholder:text-stone-400'} rounded-xl border px-3 py-2 outline-none focus:ring-1 ${isDarkMode ? 'focus:ring-white/20' : 'focus:ring-stone-300'}`}
                    />
                    {sessionSystemPrompt.trim() ? (
                      <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-amber-300/80' : 'text-amber-700'}`}>
                        {sessionSystemPrompt.trim().length.toLocaleString()} chars · active on all sends
                      </p>
                    ) : null}
                  </div>
                </section>
              </div>
  );
}
