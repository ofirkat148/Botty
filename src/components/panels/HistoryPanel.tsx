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
import {
  PROJECT_COLOR_PRESETS,
  getProjectActivePill,
  getProjectDotClass,
  getProjectBadgeClass,
} from '../../utils/projectColors';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function HistoryPanel() {
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
                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="font-medium">Usage overview</h3>
                      <p className={`mt-1 text-sm ${subtleTextClass}`}>Track today&apos;s token usage by provider and model, plus the last 7 days of activity.</p>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <span className={`text-sm ${subtleTextClass}`}>
                        ~{dailyTokens.toLocaleString()} tokens today
                      </span>
                      <span className={`text-sm ${subtleTextClass}`}>
                        {agentFactCounts.total} memory facts
                      </span>
                    </div>

                    {usageTrend.length > 1 ? (
                      <div>
                        <div className={`mb-1 flex items-center justify-between text-xs ${subtleTextClass}`}>
                          <span>Last {usageTrend.length} days</span>
                          <span className="flex gap-3">
                            <span>min: <strong>{Math.min(...usageTrend.map(e => e.tokens)).toLocaleString()}</strong></span>
                            <span>max: <strong>{trendPeak.toLocaleString()}</strong></span>
                          </span>
                        </div>
                        <div className="flex items-end gap-0.5 h-10">
                          {usageTrend.map((entry, i) => {
                            const pct = trendPeak > 0 ? (entry.tokens / trendPeak) * 100 : 0;
                            const isToday = i === usageTrend.length - 1;
                            return (
                              <div
                                key={entry.date}
                                title={`${entry.date}: ${entry.tokens.toLocaleString()} tokens`}
                                style={{ height: `${Math.max(pct, 4)}%` }}
                                className={`flex-1 rounded-sm transition-all ${isToday ? (isDarkMode ? 'bg-sky-400' : 'bg-sky-500') : (isDarkMode ? 'bg-white/20' : 'bg-stone-300')}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>

                <div className="flex gap-2">
                  <input
                    value={historySearch}
                    onChange={event => setHistorySearch(event.target.value)}
                    placeholder="Search conversations..."
                    className={`flex-1 ${textInputClass}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowArchivedHistory(v => !v)}
                    className={responsiveSecondaryButtonClass}
                    title={showArchivedHistory ? 'Show active conversations' : 'Show archived conversations'}
                  >
                    {showArchivedHistory ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    <span className="hidden sm:inline">{showArchivedHistory ? 'Active' : 'Archived'}</span>
                  </button>
                  {!showArchivedHistory && conversations.length > 0 ? (
                    confirmingClearHistory ? (
                      <>
                        <button type="button" onClick={() => void clearAllHistory()} className={`${responsiveSecondaryButtonClass} text-red-600 dark:text-red-400`}>Confirm clear</button>
                        <button type="button" onClick={() => setConfirmingClearHistory(false)} className={responsiveSecondaryButtonClass}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmingClearHistory(true)} className={responsiveSecondaryButtonClass} title="Clear all history">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  ) : null}
                </div>

                {/* Projects panel */}
                <section className={sectionCardClass}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">Projects</h3>
                    <button type="button" onClick={() => setCreatingProject(v => !v)} className={responsiveSecondaryButtonClass}>
                      <Plus className="w-4 h-4" />
                      New project
                    </button>
                  </div>
                  {creatingProject ? (
                    <form onSubmit={event => { event.preventDefault(); void createProject(); }} className="mt-3 flex flex-col gap-2">
                      <input
                        autoFocus
                        value={newProjectName}
                        onChange={event => setNewProjectName(event.target.value)}
                        placeholder="Project name…"
                        className={`text-sm ${inputClass}`}
                      />
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${subtleTextClass}`}>Color</span>
                        {PROJECT_COLOR_PRESETS.map(c => (
                          <button key={c} type="button" title={c} onClick={() => setNewProjectColor(c)}
                            className={`w-4 h-4 rounded-full transition-all ${getProjectDotClass(c)} ${newProjectColor === c ? 'ring-2 ring-offset-1 ring-offset-transparent scale-125' : 'opacity-60 hover:opacity-100'}`} />
                        ))}
                      </div>
                      <textarea
                        value={newProjectSystemPrompt}
                        onChange={event => setNewProjectSystemPrompt(event.target.value)}
                        placeholder="System prompt for this project (optional)…"
                        rows={2}
                        className={`text-sm resize-none ${inputClass}`}
                      />
                      <div className="flex gap-2">
                        <button type="submit" className={responsivePrimaryButtonClass}>Create</button>
                        <button type="button" onClick={() => { setCreatingProject(false); setNewProjectName(''); setNewProjectColor('stone'); setNewProjectSystemPrompt(''); }} className={responsiveSecondaryButtonClass}>Cancel</button>
                      </div>
                    </form>
                  ) : null}
                  {projects.length === 0 && !creatingProject ? (
                    <p className={`mt-2 text-sm ${subtleTextClass}`}>No projects yet. Group conversations into named folders with a shared system prompt.</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeProjectFilter ? (
                        <button
                          type="button"
                          onClick={() => setActiveProjectFilter(null)}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${isDarkMode ? 'bg-white/10 text-stone-200' : 'bg-stone-200 text-stone-700'}`}
                        >
                          <X className="w-3 h-3" /> All conversations
                        </button>
                      ) : null}
                      {projects.map(proj => (
                        <div key={proj.id} className="flex items-center gap-1">
                          {editingProjectId === proj.id ? (
                            <form onSubmit={event => { event.preventDefault(); void updateProject(proj.id, editingProject); }} className="w-full flex flex-col gap-2 mt-1">
                              <input
                                autoFocus
                                value={editingProject.name ?? proj.name}
                                onChange={event => setEditingProject(p => ({ ...p, name: event.target.value }))}
                                className={`text-sm ${inputClass}`}
                              />
                              <div className="flex items-center gap-2">
                                <span className={`text-xs ${subtleTextClass}`}>Color</span>
                                {PROJECT_COLOR_PRESETS.map(c => (
                                  <button key={c} type="button" title={c} onClick={() => setEditingProject(p => ({ ...p, color: c }))}
                                    className={`w-4 h-4 rounded-full transition-all ${getProjectDotClass(c)} ${(editingProject.color ?? proj.color) === c ? 'ring-2 ring-offset-1 ring-offset-transparent scale-125' : 'opacity-60 hover:opacity-100'}`} />
                                ))}
                              </div>
                              <textarea
                                value={editingProject.systemPrompt ?? proj.systemPrompt ?? ''}
                                onChange={event => setEditingProject(p => ({ ...p, systemPrompt: event.target.value }))}
                                placeholder="System prompt for this project (optional)…"
                                rows={3}
                                className={`text-sm resize-none ${inputClass}`}
                              />
                              <div className="flex gap-2">
                                <button type="submit" className={responsivePrimaryButtonClass}>Save</button>
                                <button type="button" onClick={() => { setEditingProjectId(''); setEditingProject({}); }} className={responsiveSecondaryButtonClass}>Cancel</button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setActiveProjectFilter(id => id === proj.id ? null : proj.id)}
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${activeProjectFilter === proj.id ? getProjectActivePill(proj.color, isDarkMode) : (isDarkMode ? 'bg-white/8 text-stone-200 hover:bg-white/14' : 'bg-stone-100 text-stone-700 hover:bg-stone-200')}`}
                              >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${getProjectDotClass(proj.color)}`} />
                                {proj.name}
                              </button>
                              <button type="button" onClick={() => { setEditingProjectId(proj.id); setEditingProject({ name: proj.name, color: proj.color, systemPrompt: proj.systemPrompt }); }} className={`rounded-full p-1 ${subtleTextClass} hover:opacity-80`} title="Edit project"><Pencil className="w-3 h-3" /></button>
                              <button type="button" onClick={() => void deleteProject(proj.id)} className={`rounded-full p-1 ${subtleTextClass} hover:text-red-500`} title="Delete project"><Trash2 className="w-3 h-3" /></button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {(() => {
                  const filtered = conversations.filter(item =>
                    !historySearch.trim() || item.items.some(entry =>
                      entry.prompt.toLowerCase().includes(historySearch.toLowerCase()) ||
                      entry.response.toLowerCase().includes(historySearch.toLowerCase())
                    ) || (conversationLabels[item.id] || '').toLowerCase().includes(historySearch.toLowerCase())
                  ).filter(item => !activeProjectFilter || item.items.some(e => e.projectId === activeProjectFilter))
                  .sort((a, b) => {
                    const aPinned = pinnedConversations.has(a.id) ? 0 : 1;
                    const bPinned = pinnedConversations.has(b.id) ? 0 : 1;
                    return aPinned - bPinned;
                  });

                  // Grouped view: project headers + cards when no filter/search and projects exist
                  if (!activeProjectFilter && !historySearch.trim() && projects.length > 0) {
                    type ConvGroup = typeof filtered[0];
                    const groups: Array<{ project: typeof projects[0] | null; items: ConvGroup[] }> = [];
                    for (const proj of projects) {
                      const projItems = filtered.filter(c => c.items.some(e => e.projectId === proj.id));
                      if (projItems.length > 0) groups.push({ project: proj, items: projItems });
                    }
                    const unassigned = filtered.filter(c => !c.items.some(e => e.projectId));
                    if (unassigned.length > 0) groups.push({ project: null, items: unassigned });
                    if (groups.length === 0) return null;
                    return <>{groups.map(({ project, items: groupItems }) => (
                      <div key={project?.id ?? '__unassigned__'} className="mb-1">
                        <div className="flex items-center gap-2 px-1 pb-1.5 pt-3">
                          {project ? (
                            <>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${getProjectDotClass(project.color)}`} />
                              <button
                                type="button"
                                onClick={() => setActiveProjectFilter(project.id)}
                                className={`text-xs font-semibold uppercase tracking-wide hover:underline ${getProjectBadgeClass(project.color, isDarkMode)}`}
                              >
                                {project.name}
                              </button>
                              <span className={`text-xs ${subtleTextClass}`}>· {groupItems.length}</span>
                            </>
                          ) : (
                            <span className={`text-xs font-semibold uppercase tracking-wide ${subtleTextClass}`}>
                              Unassigned · {groupItems.length}
                            </span>
                          )}
                        </div>
                        {groupItems.map(item => (
                    <div key={item.id} data-pinned={pinnedConversations.has(item.id) ? 'true' : undefined} className={`${sectionCardClass} flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${pinnedConversations.has(item.id) ? (isDarkMode ? 'ring-1 ring-amber-400/30' : 'ring-1 ring-amber-400/60') : ''}`}>
                      <div className="min-w-0 flex-1">
                        {editingLabelId === item.id ? (
                          <form onSubmit={event => { event.preventDefault(); void saveConversationLabel(item.id, labelDraft); }} className="mb-2 flex gap-2">
                            <input
                              autoFocus
                              value={labelDraft}
                              onChange={event => setLabelDraft(event.target.value)}
                              placeholder="Rename this conversation…"
                              className={`flex-1 text-sm ${inputClass}`}
                            />
                            <button type="submit" className={responsivePrimaryButtonClass}>Save</button>
                            <button type="button" onClick={() => setEditingLabelId('')} className={responsiveSecondaryButtonClass}>Cancel</button>
                          </form>
                        ) : (
                          <button type="button" onClick={() => { setEditingLabelId(item.id); setLabelDraft(conversationLabels[item.id] || ''); }} className="w-full text-left">
                            <div className="text-sm font-medium line-clamp-2">
                              {conversationLabels[item.id] || item.items[0].prompt}
                            </div>
                            {conversationLabels[item.id] ? (
                              <div className={`mt-0.5 text-xs line-clamp-1 ${subtleTextClass}`}>{item.items[0].prompt}</div>
                            ) : null}
                          </button>
                        )}
                        <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${subtleTextClass}`}>
                          <span>{(() => { const t = item.items.reduce((s, e) => s + (e.tokensUsed || 0), 0); return t > 0 ? `${t.toLocaleString()} tokens total` : 'Tokens: unknown'; })()}</span>
                          <span>{new Date(item.items[0].timestamp).toLocaleString()}</span>
                          <span>{item.items.length} message pair{item.items.length === 1 ? '' : 's'}</span>
                          {(() => { const pid = item.items.find(e => e.projectId)?.projectId; const proj = pid ? projects.find(p => p.id === pid) : null; return proj ? <span className={`flex items-center gap-1 font-medium ${getProjectBadgeClass(proj.color, isDarkMode)}`}><span className={`w-1.5 h-1.5 rounded-full ${getProjectDotClass(proj.color)}`} />{proj.name}</span> : null; })()}
                        </div>
                        {assigningConvId === item.id && projects.length > 0 ? (
                          <div className={`mt-2 flex flex-wrap gap-2`}>
                            <span className={`text-xs ${subtleTextClass}`}>Move to:</span>
                            {projects.map(proj => (
                              <button key={proj.id} type="button" onClick={() => void assignConversationToProject(item.id, proj.id)} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${isDarkMode ? 'bg-white/8 hover:bg-white/14 text-stone-200' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'}`}>
                                <span className={`w-2 h-2 rounded-full shrink-0 ${getProjectDotClass(proj.color)}`} />{proj.name}
                              </button>
                            ))}
                            {item.items.some(e => e.projectId) ? <button type="button" onClick={() => void assignConversationToProject(item.id, null)} className={`rounded-full px-2.5 py-1 text-xs text-red-500`}>Remove from project</button> : null}
                            <button type="button" onClick={() => setAssigningConvId('')} className={`rounded-full px-2.5 py-1 text-xs ${subtleTextClass}`}>Cancel</button>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex w-full flex-col gap-2 self-start sm:w-auto sm:flex-row lg:self-center">
                        <button onClick={() => loadConversation(item.id)} className={responsiveSecondaryButtonClass}>Open</button>
                        <button onClick={() => exportConversation(item)} className={responsiveSecondaryButtonClass} title="Export as Markdown">
                          <Download className="w-4 h-4" />
                        </button>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenConvMenuId(id => id === item.id ? '' : item.id)}
                            className={responsiveSecondaryButtonClass}
                            title="More actions"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {openConvMenuId === item.id ? (
                            <div className={`absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-xl border py-1 shadow-lg ${isDarkMode ? 'border-white/10 bg-stone-900 text-stone-200' : 'border-stone-200 bg-white text-stone-700'}`}>
                              {!showArchivedHistory ? (
                                <button type="button" onClick={() => { setEditingLabelId(item.id); setLabelDraft(conversationLabels[item.id] || ''); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                  <Pencil className="w-3.5 h-3.5" /> Rename
                                </button>
                              ) : null}
                              {!showArchivedHistory ? (
                                <button type="button" onClick={() => { void togglePinConversation(item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'} ${pinnedConversations.has(item.id) ? (isDarkMode ? 'text-amber-300' : 'text-amber-600') : ''}`}>
                                  <Pin className="w-3.5 h-3.5" /> {pinnedConversations.has(item.id) ? 'Unpin' : 'Pin'}
                                </button>
                              ) : null}
                              {!showArchivedHistory ? (
                                <button type="button" onClick={() => { void shareConversation(item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                  <Share2 className="w-3.5 h-3.5" /> Share
                                </button>
                              ) : null}
                              {!showArchivedHistory && projects.length > 0 ? (
                                <button type="button" onClick={() => { setAssigningConvId(id => id === item.id ? '' : item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                  <Layers className="w-3.5 h-3.5" /> Assign project
                                </button>
                              ) : null}
                              <button type="button" onClick={() => { exportConversationCSV(item); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                <span className="w-3.5 text-xs font-medium">CSV</span> Export CSV
                              </button>
                              {showArchivedHistory ? (
                                <button type="button" onClick={() => { void unarchiveConversation(item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                  <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                                </button>
                              ) : (
                                <button type="button" onClick={() => { void archiveConversation(item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                  <Archive className="w-3.5 h-3.5" /> Archive
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <button onClick={() => void deleteConversation(item.id)} className={responsiveDestructiveButtonClass}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {sharingConvId === item.id && shareLink ? (
                        <div className={`mt-2 rounded-xl border px-3 py-2.5 text-sm flex items-center gap-2 ${isDarkMode ? 'border-sky-400/20 bg-sky-500/8' : 'border-sky-200 bg-sky-50'}`}>
                          {shareLink === 'error' ? (
                            <span className="text-red-500">Failed to create share link.</span>
                          ) : (
                            <>
                              <a href={shareLink} target="_blank" rel="noopener noreferrer" className={`flex-1 truncate font-mono text-xs ${isDarkMode ? 'text-sky-300' : 'text-sky-700'}`}>{shareLink}</a>
                              <button onClick={() => void navigator.clipboard.writeText(shareLink)} className={`shrink-0 rounded-lg px-2 py-1 text-xs ${isDarkMode ? 'bg-white/8 hover:bg-white/14' : 'bg-stone-100 hover:bg-stone-200'}`} title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
                              <button onClick={() => void revokeShare(item.id)} className={`shrink-0 rounded-lg px-2 py-1 text-xs text-red-500`} title="Revoke share">Revoke</button>
                              <button onClick={() => { setSharingConvId(''); setShareLink(''); }} className={`shrink-0 ${subtleTextClass}`} title="Dismiss"><X className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                        ))}
                      </div>
                    ))}</>;
                  }

                  // Flat list: filter active, searching, or no projects
                  return <>{filtered.map(item => (
                  <div key={item.id} data-pinned={pinnedConversations.has(item.id) ? 'true' : undefined} className={`${sectionCardClass} flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${pinnedConversations.has(item.id) ? (isDarkMode ? 'ring-1 ring-amber-400/30' : 'ring-1 ring-amber-400/60') : ''}`}>
                    <div className="min-w-0 flex-1">
                      {editingLabelId === item.id ? (
                        <form onSubmit={event => { event.preventDefault(); void saveConversationLabel(item.id, labelDraft); }} className="mb-2 flex gap-2">
                          <input
                            autoFocus
                            value={labelDraft}
                            onChange={event => setLabelDraft(event.target.value)}
                            placeholder="Rename this conversation…"
                            className={`flex-1 text-sm ${inputClass}`}
                          />
                          <button type="submit" className={responsivePrimaryButtonClass}>Save</button>
                          <button type="button" onClick={() => setEditingLabelId('')} className={responsiveSecondaryButtonClass}>Cancel</button>
                        </form>
                      ) : (
                        <button type="button" onClick={() => { setEditingLabelId(item.id); setLabelDraft(conversationLabels[item.id] || ''); }} className="w-full text-left">
                          <div className="text-sm font-medium line-clamp-2">
                            {conversationLabels[item.id] || item.items[0].prompt}
                          </div>
                          {conversationLabels[item.id] ? (
                            <div className={`mt-0.5 text-xs line-clamp-1 ${subtleTextClass}`}>{item.items[0].prompt}</div>
                          ) : null}
                        </button>
                      )}
                      <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${subtleTextClass}`}>
                        <span>{(() => { const t = item.items.reduce((s, e) => s + (e.tokensUsed || 0), 0); return t > 0 ? `${t.toLocaleString()} tokens total` : 'Tokens: unknown'; })()}</span>
                        <span>{new Date(item.items[0].timestamp).toLocaleString()}</span>
                        <span>{item.items.length} message pair{item.items.length === 1 ? '' : 's'}</span>
                        {(() => { const pid = item.items.find(e => e.projectId)?.projectId; const proj = pid ? projects.find(p => p.id === pid) : null; return proj ? <span className={`flex items-center gap-1 font-medium ${getProjectBadgeClass(proj.color, isDarkMode)}`}><span className={`w-1.5 h-1.5 rounded-full ${getProjectDotClass(proj.color)}`} />{proj.name}</span> : null; })()}
                      </div>
                      {assigningConvId === item.id && projects.length > 0 ? (
                        <div className={`mt-2 flex flex-wrap gap-2`}>
                          <span className={`text-xs ${subtleTextClass}`}>Move to:</span>
                          {projects.map(proj => (
                            <button key={proj.id} type="button" onClick={() => void assignConversationToProject(item.id, proj.id)} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${isDarkMode ? 'bg-white/8 hover:bg-white/14 text-stone-200' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'}`}>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${getProjectDotClass(proj.color)}`} />{proj.name}
                            </button>
                          ))}
                          {item.items.some(e => e.projectId) ? <button type="button" onClick={() => void assignConversationToProject(item.id, null)} className={`rounded-full px-2.5 py-1 text-xs text-red-500`}>Remove from project</button> : null}
                          <button type="button" onClick={() => setAssigningConvId('')} className={`rounded-full px-2.5 py-1 text-xs ${subtleTextClass}`}>Cancel</button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex w-full flex-col gap-2 self-start sm:w-auto sm:flex-row lg:self-center">
                      <button onClick={() => loadConversation(item.id)} className={responsiveSecondaryButtonClass}>Open</button>
                      <button onClick={() => exportConversation(item)} className={responsiveSecondaryButtonClass} title="Export as Markdown">
                        <Download className="w-4 h-4" />
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenConvMenuId(id => id === item.id ? '' : item.id)}
                          className={responsiveSecondaryButtonClass}
                          title="More actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {openConvMenuId === item.id ? (
                          <div className={`absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-xl border py-1 shadow-lg ${isDarkMode ? 'border-white/10 bg-stone-900 text-stone-200' : 'border-stone-200 bg-white text-stone-700'}`}>
                            {!showArchivedHistory ? (
                              <button type="button" onClick={() => { setEditingLabelId(item.id); setLabelDraft(conversationLabels[item.id] || ''); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                <Pencil className="w-3.5 h-3.5" /> Rename
                              </button>
                            ) : null}
                            {!showArchivedHistory ? (
                              <button type="button" onClick={() => { void togglePinConversation(item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'} ${pinnedConversations.has(item.id) ? (isDarkMode ? 'text-amber-300' : 'text-amber-600') : ''}`}>
                                <Pin className="w-3.5 h-3.5" /> {pinnedConversations.has(item.id) ? 'Unpin' : 'Pin'}
                              </button>
                            ) : null}
                            {!showArchivedHistory ? (
                              <button type="button" onClick={() => { void shareConversation(item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                <Share2 className="w-3.5 h-3.5" /> Share
                              </button>
                            ) : null}
                            {!showArchivedHistory && projects.length > 0 ? (
                              <button type="button" onClick={() => { setAssigningConvId(id => id === item.id ? '' : item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                <Layers className="w-3.5 h-3.5" /> Assign project
                              </button>
                            ) : null}
                            <button type="button" onClick={() => { exportConversationCSV(item); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                              <span className="w-3.5 text-xs font-medium">CSV</span> Export CSV
                            </button>
                            {showArchivedHistory ? (
                              <button type="button" onClick={() => { void unarchiveConversation(item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                              </button>
                            ) : (
                              <button type="button" onClick={() => { void archiveConversation(item.id); setOpenConvMenuId(''); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:${isDarkMode ? 'bg-white/8' : 'bg-stone-50'}`}>
                                <Archive className="w-3.5 h-3.5" /> Archive
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <button onClick={() => void deleteConversation(item.id)} className={responsiveDestructiveButtonClass}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {sharingConvId === item.id && shareLink ? (
                      <div className={`mt-2 rounded-xl border px-3 py-2.5 text-sm flex items-center gap-2 ${isDarkMode ? 'border-sky-400/20 bg-sky-500/8' : 'border-sky-200 bg-sky-50'}`}>
                        {shareLink === 'error' ? (
                          <span className="text-red-500">Failed to create share link.</span>
                        ) : (
                          <>
                            <a href={shareLink} target="_blank" rel="noopener noreferrer" className={`flex-1 truncate font-mono text-xs ${isDarkMode ? 'text-sky-300' : 'text-sky-700'}`}>{shareLink}</a>
                            <button onClick={() => void navigator.clipboard.writeText(shareLink)} className={`shrink-0 rounded-lg px-2 py-1 text-xs ${isDarkMode ? 'bg-white/8 hover:bg-white/14' : 'bg-stone-100 hover:bg-stone-200'}`} title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
                            <button onClick={() => void revokeShare(item.id)} className={`shrink-0 rounded-lg px-2 py-1 text-xs text-red-500`} title="Revoke share">Revoke</button>
                            <button onClick={() => { setSharingConvId(''); setShareLink(''); }} className={`shrink-0 ${subtleTextClass}`} title="Dismiss"><X className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>

                  ))}
                {conversations.length === 0 && !historyLoading ? <div className={`text-sm ${subtleTextClass}`}>No saved history yet.</div> : null}
                {historyLoading ? (
                  <div className="flex flex-col gap-2 animate-pulse">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-stone-100'}`}>
                        <div className={`h-3.5 w-2/3 rounded mb-2 ${isDarkMode ? 'bg-white/10' : 'bg-stone-200'}`} />
                        <div className={`h-3 w-1/2 rounded ${isDarkMode ? 'bg-white/7' : 'bg-stone-200/70'}`} />
                      </div>
                    ))}
                  </div>
                ) : null}
                {filtered.length === 0 && historySearch.trim() ? <div className={`text-sm ${subtleTextClass}`}>No conversations match your search.</div> : null}
                </>;
                })()}
              </div>
  );
}
