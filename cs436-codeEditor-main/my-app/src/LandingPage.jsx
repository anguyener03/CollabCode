import { useState } from "react";
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Text,
  VStack,
  FormControl,
  FormErrorMessage,
} from "@chakra-ui/react";

const LandingPage = ({ onHostSession, onJoinSession }) => {
  const [mode, setMode] = useState(null); // null | 'host' | 'join'
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleHost = async () => {
    if (!name.trim()) { setError("Please enter your name"); return; }
    setError("");
    setIsLoading(true);
    try {
      await onHostSession(name.trim());
    } catch {
      setError("Failed to create room. Is the server running?");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!name.trim()) { setError("Please enter your name"); return; }
    if (code.trim().length !== 6) { setError("Room code must be 6 characters"); return; }
    setError("");
    setIsLoading(true);
    try {
      await onJoinSession(name.trim(), code.trim());
    } catch (err) {
      setError(err.message || "Failed to join room");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      mode === "host" ? handleHost() : handleJoin();
    }
  };

  return (
    <Box display="flex" alignItems="center" justifyContent="center" minH="100vh">
      <VStack spacing={8} align="center" w="full" maxW="420px" px={4}>
        {/* Header */}
        <VStack spacing={2}>
          <Heading size="2xl" color="white" letterSpacing="tight">
            CollabCode
          </Heading>
          <Text color="gray.400" fontSize="md">
            Live collaborative coding sessions
          </Text>
        </VStack>

        {/* Mode selection */}
        <HStack spacing={4} w="full">
          <Button
            size="lg"
            flex={1}
            colorScheme="teal"
            variant={mode === "host" ? "solid" : "outline"}
            onClick={() => { setMode("host"); setError(""); }}
          >
            Host a Session
          </Button>
          <Button
            size="lg"
            flex={1}
            colorScheme="teal"
            variant={mode === "join" ? "solid" : "outline"}
            onClick={() => { setMode("join"); setError(""); }}
          >
            Join a Session
          </Button>
        </HStack>

        {/* Form */}
        {mode && (
          <VStack spacing={3} w="full">
            <FormControl isInvalid={!!error}>
              <Input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                size="lg"
                bg="gray.800"
                borderColor="gray.600"
                _hover={{ borderColor: "teal.400" }}
                _focus={{ borderColor: "teal.400", boxShadow: "none" }}
                color="white"
              />
            </FormControl>

            {mode === "join" && (
              <Input
                placeholder="Room code (6 characters)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                maxLength={6}
                size="lg"
                bg="gray.800"
                borderColor="gray.600"
                _hover={{ borderColor: "teal.400" }}
                _focus={{ borderColor: "teal.400", boxShadow: "none" }}
                color="white"
                fontFamily="mono"
                letterSpacing="widest"
              />
            )}

            {error && (
              <Text color="red.400" fontSize="sm" alignSelf="flex-start">
                {error}
              </Text>
            )}

            <Button
              colorScheme="teal"
              size="lg"
              w="full"
              isLoading={isLoading}
              onClick={mode === "host" ? handleHost : handleJoin}
            >
              {mode === "host" ? "Create Room" : "Join Room"}
            </Button>
          </VStack>
        )}
      </VStack>
    </Box>
  );
};

export default LandingPage;
