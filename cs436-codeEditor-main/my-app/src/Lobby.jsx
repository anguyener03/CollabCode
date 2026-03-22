import {
  Box,
  Badge,
  Button,
  Heading,
  HStack,
  IconButton,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { CopyIcon } from "@chakra-ui/icons";

const Lobby = ({ roomCode, userName, isHost, participants, onStartSession, onLeave }) => {
  const toast = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
    toast({ title: "Room code copied!", status: "success", duration: 2000, isClosable: true });
  };

  const otherCount = participants.filter((p) => !p.isHost).length;

  return (
    <Box display="flex" alignItems="center" justifyContent="center" minH="100vh">
      <VStack spacing={8} align="center" w="full" maxW="420px" px={4}>
        <Heading size="xl" color="white">
          Session Lobby
        </Heading>

        {/* Room code display */}
        <Box
          bg="gray.800"
          p={6}
          borderRadius="xl"
          border="2px solid"
          borderColor="teal.400"
          w="full"
          textAlign="center"
        >
          <Text color="gray.400" fontSize="sm" mb={2}>
            Room Code
          </Text>
          <HStack justify="center" spacing={3}>
            <Text
              fontSize="4xl"
              fontWeight="bold"
              fontFamily="mono"
              letterSpacing="widest"
              color="teal.300"
            >
              {roomCode}
            </Text>
            <IconButton
              icon={<CopyIcon />}
              onClick={handleCopy}
              size="sm"
              colorScheme="teal"
              variant="ghost"
              aria-label="Copy room code"
            />
          </HStack>
          <Text color="gray.500" fontSize="xs" mt={2}>
            Share this code with participants
          </Text>
        </Box>

        {/* Participant list */}
        <Box w="full">
          <Text fontWeight="bold" color="gray.300" mb={3} fontSize="sm">
            IN THE ROOM ({participants.length})
          </Text>
          <VStack align="stretch" spacing={2}>
            {participants.map((p) => (
              <HStack
                key={p.name}
                bg="gray.800"
                px={4}
                py={3}
                borderRadius="md"
                spacing={3}
              >
                <Badge colorScheme={p.isHost ? "teal" : "gray"} fontSize="xs">
                  {p.isHost ? "Host" : "Participant"}
                </Badge>
                <Text color="white">{p.name}</Text>
                {p.name === userName && (
                  <Text color="gray.500" fontSize="xs">
                    (you)
                  </Text>
                )}
              </HStack>
            ))}
            {participants.length === 0 && (
              <Text color="gray.600" fontSize="sm" textAlign="center" py={4}>
                Waiting for participants...
              </Text>
            )}
          </VStack>
        </Box>

        {/* Actions */}
        {isHost ? (
          <VStack spacing={3} w="full">
            <Button
              colorScheme="teal"
              size="lg"
              w="full"
              onClick={onStartSession}
              isDisabled={otherCount < 1}
            >
              Start Session
            </Button>
            {otherCount < 1 && (
              <Text color="gray.500" fontSize="sm">
                Waiting for at least one participant to join...
              </Text>
            )}
          </VStack>
        ) : (
          <Text color="gray.400" fontSize="md">
            Waiting for the host to start the session...
          </Text>
        )}

        <Button variant="ghost" colorScheme="red" size="sm" onClick={onLeave}>
          Leave
        </Button>
      </VStack>
    </Box>
  );
};

export default Lobby;
