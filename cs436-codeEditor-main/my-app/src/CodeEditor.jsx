import { useRef, useState, useEffect, useCallback } from "react";
import {
  Box,
  Badge,
  Button,
  Text,
  Tab,
  Tabs,
  TabList,
  TabPanel,
  TabPanels,
  IconButton,
  Input,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  HStack,
} from "@chakra-ui/react";
import { Editor } from "@monaco-editor/react";
import { CloseIcon } from "@chakra-ui/icons";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Output from "./Output";
import Chat from "./Chat";
import { executeCode } from "./pistonAPI";

const DEFAULT_LAYOUT = [40, 30, 30];
const CURSOR_COLORS = ["#f97316", "#a855f7", "#ec4899", "#eab308", "#3b82f6", "#ef4444"];

const ResizeHandle = () => (
  <PanelResizeHandle className="panel-resize-handle">
    <div style={{ width: "5px", height: "100%", cursor: "col-resize" }} />
  </PanelResizeHandle>
);

const CodeEditor = ({ userName, roomCode, isHost, isEditor, ws, participants, setParticipants, onLeave }) => {
  const editorRefs = useRef({});
  const panelGroupRef = useRef(null);
  const debounceTimeout = useRef(null);
  const monacoRef = useRef(null);
  const remoteCursors = useRef(new Map()); // Map<name, { widget, decorationIds }>
  const cursorThrottle = useRef(null);
  const participantsRef = useRef(participants);

  const [tabs, setTabs] = useState([{ id: 1, name: "main.py", content: "" }]);
  const [currentTab, setCurrentTab] = useState(1);
  const [output, setOutput] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Keep participantsRef in sync so renderRemoteCursor always has fresh data
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // When this client becomes an editor, immediately broadcast their cursor position.
  // Monaco suppresses onDidChangeCursorPosition in readOnly mode, so the host
  // wouldn't see their cursor until they physically moved it otherwise.
  useEffect(() => {
    if (!isEditor) return;
    const editor = editorRefs.current[currentTab];
    if (!editor || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    const position = editor.getPosition();
    if (position) {
      ws.current.send(JSON.stringify({
        event: "cursor-update",
        data: { roomCode, name: userName, line: position.lineNumber, column: position.column },
      }));
    }
  }, [isEditor]);

  // Render a remote cursor widget for a participant
  const renderRemoteCursor = useCallback((name, line, column) => {
    const editor = editorRefs.current[currentTab];
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const others = participantsRef.current.filter((p) => p.name !== userName);
    const idx = others.findIndex((p) => p.name === name);
    const color = CURSOR_COLORS[idx >= 0 ? idx % CURSOR_COLORS.length : 0];

    // Remove existing widget for this user
    const existing = remoteCursors.current.get(name);
    if (existing) {
      editor.removeContentWidget(existing.widget);
      editor.deltaDecorations(existing.decorationIds, []);
    }

    // Build the DOM node: colored bar with a floating name label above
    const domNode = document.createElement("div");
    domNode.style.cssText = "position: relative; pointer-events: none;";

    const label = document.createElement("div");
    label.textContent = name;
    label.style.cssText = `
      position: absolute; bottom: 100%; left: 0;
      background: ${color}; color: white;
      font-size: 10px; padding: 1px 5px; border-radius: 3px 3px 3px 0;
      white-space: nowrap; pointer-events: none; z-index: 100;
    `;

    const bar = document.createElement("div");
    bar.style.cssText = `width: 2px; height: 18px; background: ${color};`;

    domNode.appendChild(label);
    domNode.appendChild(bar);

    const widget = {
      getId: () => `remote-cursor-${name}`,
      getDomNode: () => domNode,
      getPosition: () => ({
        position: { lineNumber: line, column },
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
      }),
    };

    editor.addContentWidget(widget);

    const decorationIds = editor.deltaDecorations([], [{
      range: new monaco.Range(line, 1, line, 1),
      options: { isWholeLine: false },
    }]);

    remoteCursors.current.set(name, { widget, decorationIds });
  }, [currentTab, userName]);

  // Remove a single remote cursor
  const removeRemoteCursor = useCallback((name) => {
    const editor = editorRefs.current[currentTab];
    const entry = remoteCursors.current.get(name);
    if (editor && entry) {
      editor.removeContentWidget(entry.widget);
      editor.deltaDecorations(entry.decorationIds, []);
    }
    remoteCursors.current.delete(name);
  }, [currentTab]);

  // Set up WebSocket message handler and request current code state on mount
  useEffect(() => {
    if (!ws.current) return;

    const prevHandler = ws.current.onmessage;

    ws.current.onmessage = (event) => {
      const { event: evt, data } = JSON.parse(event.data);

      switch (evt) {
        case "code-update":
          setTabs((prev) =>
            prev.map((tab) => (tab.id === currentTab ? { ...tab, content: data.content } : tab))
          );
          break;
        case "code-state":
          setTabs((prev) =>
            prev.map((tab) => (tab.id === 1 ? { ...tab, content: data.content } : tab))
          );
          break;
        case "participant-joined":
          setParticipants((prev) => [...prev, { name: data.name, isHost: data.isHost, isEditor: data.isEditor }]);
          break;
        case "participant-left":
          setParticipants((prev) => prev.filter((p) => p.name !== data.name));
          removeRemoteCursor(data.name);
          break;
        case "cursor-update":
          renderRemoteCursor(data.name, data.line, data.column);
          break;
        default:
          if (prevHandler) prevHandler(event);
          break;
      }
    };

    ws.current.send(JSON.stringify({ event: "request-code-state", data: { roomCode } }));

    return () => {
      if (ws.current) ws.current.onmessage = prevHandler;
      // Clean up all remote cursor widgets on unmount
      const editor = editorRefs.current[currentTab];
      if (editor) {
        remoteCursors.current.forEach(({ widget, decorationIds }) => {
          editor.removeContentWidget(widget);
          editor.deltaDecorations(decorationIds, []);
        });
      }
      remoteCursors.current.clear();
      if (cursorThrottle.current) clearTimeout(cursorThrottle.current);
    };
  }, [roomCode]);

  const resetPanels = () => {
    if (panelGroupRef.current) panelGroupRef.current.setLayout(DEFAULT_LAYOUT);
  };

  const handleContentChange = (value) => {
    if (!isEditor) return;
    setTabs((prev) =>
      prev.map((tab) => (tab.id === currentTab ? { ...tab, content: value } : tab))
    );
    debounceSendUpdate(value);
  };

  const debounceSendUpdate = (content) => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ event: "code-update", data: { roomCode, content } }));
      }
    }, 300);
  };

  const addNewTab = () => {
    const newTab = { id: tabs.length + 1, name: `file${tabs.length + 1}.py`, content: "" };
    setTabs([...tabs, newTab]);
    setCurrentTab(newTab.id);
  };

  const deleteTab = (tabId) => {
    const updated = tabs.filter((tab) => tab.id !== tabId);
    if (updated.length > 0) {
      setTabs(updated);
      if (tabId === currentTab) setCurrentTab(updated[0].id);
    } else {
      setTabs([{ id: 1, name: "main.py", content: "" }]);
      setCurrentTab(1);
    }
    delete editorRefs.current[tabId];
  };

  const handleTabDoubleClick = (tabId) => {
    const tab = tabs.find((t) => t.id === tabId);
    setNewTabName(tab.name);
    setCurrentTab(tabId);
    onOpen();
  };

  const handleRenameSubmit = () => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === currentTab ? { ...tab, name: newTabName } : tab))
    );
    onClose();
  };

  const runCode = async () => {
    const currentFile = tabs.find((tab) => tab.id === currentTab);
    if (!currentFile) return;
    const sourceCode = currentFile.content;
    if (!sourceCode.trim()) return;
    try {
      setIsLoading(true);
      setIsError(false);
      const { run: result } = await executeCode(sourceCode);
      setOutput(result.output.split("\n"));
      if (result.stderr) setIsError(true);
    } catch (error) {
      console.error(error);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadFile = () => {
    const file = tabs.find((tab) => tab.id === currentTab);
    if (!file) return;
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onMount = (editor, monaco, tabId) => {
    editorRefs.current[tabId] = editor;
    monacoRef.current = monaco;
    editor.focus();

    // Send cursor position updates to other participants
    editor.onDidChangeCursorPosition((e) => {
      if (cursorThrottle.current) return;
      cursorThrottle.current = setTimeout(() => {
        cursorThrottle.current = null;
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            event: "cursor-update",
            data: { roomCode, name: userName, line: e.position.lineNumber, column: e.position.column },
          }));
        }
      }, 50);
    });
  };

  return (
    <Box height="100vh" display="flex" flexDirection="column">
      {/* Header bar */}
      <HStack
        px={4}
        py={2}
        bg="gray.800"
        borderBottom="1px solid"
        borderColor="gray.700"
        justify="space-between"
        flexShrink={0}
      >
        <Button size="sm" colorScheme="red" variant="outline" onClick={onLeave}>
          Leave
        </Button>
        <Text fontWeight="bold" color="gray.300" fontSize="sm">
          CollabCode
        </Text>
        <HStack spacing={2}>
          <Badge colorScheme="teal" fontSize="sm" px={3} py={1} borderRadius="md" fontFamily="mono" letterSpacing="widest">
            {roomCode}
          </Badge>
          <Badge colorScheme="gray" fontSize="sm">
            {participants.length} in session
          </Badge>
        </HStack>
      </HStack>

      {/* Main panels */}
      <Box flex={1} overflow="hidden">
        <PanelGroup ref={panelGroupRef} direction="horizontal">
          <Panel defaultSize={40} minSize={10}>
            <Box h="100%" display="flex" flexDirection="column">
              <Box display="flex" alignItems="center" gap={2} px={2} pt={2} pb={1}>
                <Text fontSize="sm" fontWeight="bold" color="gray.300">
                  Code
                </Text>
                <Button size="xs" onClick={addNewTab} colorScheme="teal" variant="ghost">
                  +
                </Button>
                <Button size="xs" onClick={downloadFile} colorScheme="teal" variant="ghost">
                  &#x2B73;
                </Button>
              </Box>

              <Tabs
                isFitted
                variant="enclosed"
                index={tabs.findIndex((tab) => tab.id === currentTab)}
                flex={1}
                display="flex"
                flexDirection="column"
              >
                <TabList
                  style={{
                    overflowX: "auto",
                    overflowY: "hidden",
                    maxWidth: "100%",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tabs.map((tab) => (
                    <Tab
                      key={tab.id}
                      onClick={() => setCurrentTab(tab.id)}
                      onDoubleClick={() => handleTabDoubleClick(tab.id)}
                      fontSize="xs"
                    >
                      {tab.name}
                      <IconButton
                        size="xs"
                        icon={<CloseIcon />}
                        ml={2}
                        onClick={(e) => { e.stopPropagation(); deleteTab(tab.id); }}
                        variant="ghost"
                      />
                    </Tab>
                  ))}
                </TabList>
                <TabPanels flex={1}>
                  {tabs.map((tab) => (
                    <TabPanel key={tab.id} p={0} h="100%">
                      <Editor
                        height="calc(100vh - 160px)"
                        theme="vs-dark"
                        defaultLanguage="python"
                        value={tab.content}
                        options={{ readOnly: !isEditor }}
                        onMount={(editor, monaco) => onMount(editor, monaco, tab.id)}
                        onChange={(value) => handleContentChange(value)}
                      />
                    </TabPanel>
                  ))}
                </TabPanels>
              </Tabs>
            </Box>
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={30} minSize={10}>
            <Output output={output} isError={isError} />
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={30} minSize={10}>
            <Chat userName={userName} roomCode={roomCode} isHost={isHost} ws={ws} participants={participants} />
          </Panel>
        </PanelGroup>
      </Box>

      {/* Footer bar */}
      <HStack
        px={4}
        py={2}
        bg="gray.800"
        borderTop="1px solid"
        borderColor="gray.700"
        spacing={2}
        flexShrink={0}
      >
        <Button size="sm" variant="outline" colorScheme="green" isLoading={isLoading} onClick={runCode}>
          Run Code
        </Button>
        <Button size="sm" variant="outline" colorScheme="gray" onClick={resetPanels}>
          Reset Layout
        </Button>
      </HStack>

      {/* Rename tab modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Rename Tab</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Input
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              placeholder="Enter new tab name"
              onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
            />
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="teal" onClick={handleRenameSubmit}>Rename</Button>
            <Button variant="ghost" onClick={onClose} ml={2}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default CodeEditor;
