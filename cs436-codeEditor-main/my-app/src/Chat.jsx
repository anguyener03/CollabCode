import { useState, useRef, useEffect } from "react";
import {
  Box,
  Badge,
  Button,
  HStack,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";

const Chat = ({ userName, roomCode, isHost, ws, participants }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!ws.current) return;

    const prevHandler = ws.current.onmessage;

    ws.current.onmessage = (event) => {
      const { event: evt, data } = JSON.parse(event.data);
      if (evt === "chat-message") {
        setMessages((prev) => [...prev, data]);
      } else if (prevHandler) {
        prevHandler(event);
      }
    };

    return () => {
      if (ws.current) ws.current.onmessage = prevHandler;
    };
  }, [ws]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (!input.trim() || !ws.current) return;
    ws.current.send(JSON.stringify({
      event: "chat-message",
      data: { roomCode, name: userName, text: input.trim() },
    }));
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === "Tab") {
      e.preventDefault();
      setInput((prev) => prev + "\t");
    }
  };

  const handleToggleEditor = (participant) => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({
      event: participant.isEditor ? "revoke-editor" : "grant-editor",
      data: { roomCode, targetName: participant.name },
    }));
  };

  // Badge color: teal = host, green = editor, gray = viewer
  const badgeColor = (p) => {
    if (p.isHost) return "teal";
    if (p.isEditor) return "green";
    return "gray";
  };

  const badgeLabel = (p) => {
    if (p.isHost) return "Host";
    if (p.isEditor) return "Editor";
    return "Viewer";
  };

  return (
    <Box h="100%" display="flex" flexDirection="column" p={2}>
      {/* Participant list */}
      <Box mb={2} px={1}>
        <Text fontSize="xs" color="gray.500" mb={2}>
          IN SESSION ({participants.length})
        </Text>
        <VStack align="stretch" spacing={1}>
          {participants.map((p) => (
            <HStack key={p.name} justify="space-between">
              <HStack spacing={2}>
                <Badge colorScheme={badgeColor(p)} fontSize="xs">
                  {badgeLabel(p)}
                </Badge>
                <Text fontSize="sm" color="white">
                  {p.name}
                  {p.name === userName && (
                    <Text as="span" color="gray.500" fontSize="xs"> (you)</Text>
                  )}
                </Text>
              </HStack>
              {/* Grant/revoke button — only host can see these, not for themselves */}
              {isHost && !p.isHost && (
                <Button
                  size="xs"
                  variant="ghost"
                  colorScheme={p.isEditor ? "red" : "teal"}
                  onClick={() => handleToggleEditor(p)}
                >
                  {p.isEditor ? "Revoke" : "Make Editor"}
                </Button>
              )}
            </HStack>
          ))}
        </VStack>
      </Box>

      {/* Message list */}
      <VStack
        flex={1}
        overflowY="auto"
        align="stretch"
        spacing={1}
        border="1px solid"
        borderColor="gray.700"
        borderRadius="md"
        p={2}
        mb={2}
      >
        {messages.length === 0 && (
          <Text color="gray.600" fontSize="sm" textAlign="center" mt={4}>
            No messages yet
          </Text>
        )}
        {messages.map((msg, i) => (
          <Box key={i} mb={1}>
            <Text fontSize="xs" color="teal.400" fontWeight="bold" display="inline">
              {msg.name}:{" "}
            </Text>
            <Text fontSize="sm" color="gray.200" display="inline" whiteSpace="pre-wrap">
              {msg.text}
            </Text>
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </VStack>

      {/* Input */}
      <HStack>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          size="sm"
          resize="none"
          rows={2}
          bg="gray.800"
          borderColor="gray.600"
          _focus={{ borderColor: "teal.400", boxShadow: "none" }}
          color="white"
        />
        <Button onClick={handleSendMessage} colorScheme="teal" size="sm" h="full">
          Send
        </Button>
      </HStack>
    </Box>
  );
};

export default Chat;
