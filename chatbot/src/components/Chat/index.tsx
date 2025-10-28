import warning from "assets/warning.svg";
import { useRef, useEffect, useState, useReducer } from "react";
import { Feedback, useChat } from "store/chat";
import { useForm } from "react-hook-form";
import { OpenAIApi, Configuration } from "openai";
import { useMutation } from "react-query";
import TayAvatar from "assets/tayavatar.png";
import UserAvatar from "assets/useravatar.png";
import { useSearchParams } from "react-router-dom";
import "styles/markdown.css";

//Components
import { Input } from "components/Input";
import { FiSend, FiThumbsUp, FiThumbsDown, FiRefreshCcw, FiChevronDown, FiSquare } from "react-icons/fi";
import {
  Avatar,
  Box,
  IconButton,
  Spinner,
  Stack,
  Text,
  keyframes,
} from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Instructions } from "../Layout/Instructions";
import { useAPI } from "store/api";
import config from "config";

import { v4 as uuidv4 } from "uuid";

export interface ChatProps {}

interface ChatSchema {
  input: string;
}

const pulseKeyframes = keyframes`
  0% { opacity: 0.4; }
  50% { opacity: 0.7; }
  100% { opacity: 0.4; }
`;

const ThinkingIndicator = () => (
  <Box
    padding={4}
    display="flex"
    alignItems="center"
    backgroundColor="#1e2022"
    borderRadius={8}
    marginBottom={2}
  >
    <Avatar
      name="tay"
      boxSize="54px"
      src={TayAvatar}
      marginRight={4}
    />
    <Stack direction="row" spacing={2} alignItems="center">
      <Text
        color="whiteAlpha.900"
        animation={`${pulseKeyframes} 1.5s ease-in-out infinite`}
      >
        Tay is thinking
      </Text>
      <Spinner size="sm" color="whiteAlpha.700" />
    </Stack>
  </Box>
);

export const Chat = ({ ...props }: ChatProps) => {
  const { api } = useAPI();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedChat, addMessage, editMessage, addChat, editChat, clearAll } =
    useChat();
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [streamingChatIds, setStreamingChatIds] = useState<Set<string>>(new Set());
  const [thinkingChatIds, setThinkingChatIds] = useState<Set<string>>(new Set());
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollingRef = useRef(false);
  const userHasScrolledRef = useRef(false);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const selectedId = selectedChat?.id;
  const selectedRole = selectedChat?.role;

  const hasSelectedChat = selectedChat && selectedChat?.content.length > 0;

  const { register, setValue, handleSubmit } = useForm<ChatSchema>();

  const configuration = new Configuration({
    apiKey: api,
  });

  const openAi = new OpenAIApi(configuration);

  const { mutate, isLoading } = useMutation({
    mutationKey: "prompt",
    mutationFn: async (prompt: string) =>
      await openAi.createChatCompletion({
        model: "gpt-3.5-turbo",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
  });

  const getUuid = () => {
    let uuid = searchParams.get("uuid") || window.localStorage.getItem("uuid");
    if (!uuid) {
      uuid = uuidv4();
      window.localStorage.setItem("uuid", uuid);
    }
    return uuid;
  };

  const isAtBottom = () => {
    if (!scrollContainerRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    return Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
  };

  const scrollToBottomWithOffset = (offset = 0) => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const targetScroll = container.scrollHeight - container.clientHeight - offset;
    
    isAutoScrollingRef.current = true;
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });

    // Reset user scroll tracking and enable auto-scroll
    userHasScrolledRef.current = false;
    setAutoScrollEnabled(true);
  };

  const handleAsk = async ({ input: prompt }: ChatSchema) => {
    const sendRequest = (selectedId: string, selectedChat: any) => {
      setValue("input", "");
      
      // Add user message
      addMessage(selectedId, {
        emitter: "user",
        message: prompt,
      });

      // Show thinking indicator for this chat
      if (selectedId) {
        setThinkingChatIds((prev) => {
          const next = new Set(prev);
          next.add(selectedId);
          return next;
        });
      }

      // Scroll to show the user's message
      setTimeout(() => {
        scrollToBottomWithOffset(0);
      }, 100);

      const controller = new AbortController();
      // Abort any other in-flight requests across chats (server may limit concurrency per user)
      controllersRef.current.forEach((c) => c.abort());
      controllersRef.current.clear();
      if (selectedId) {
        controllersRef.current.set(selectedId, controller);
      }
      const uuid = getUuid();
      const messageIndex = selectedChat ? selectedChat.content.length : 0;
      const newMessageId = `${selectedId}-${messageIndex}`;
      
      if (selectedId) {
        setStreamingChatIds((prev) => {
          const next = new Set(prev);
          next.add(selectedId);
          return next;
        });
      }
      setAutoScrollEnabled(true);
      userHasScrolledRef.current = false;

      fetch(config.URL + "/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: prompt,
          uuid: uuid,
          session_id: selectedId,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Server error');
          }
          
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let message = "";
          
          if (reader) {
            if (selectedId) {
              // Hide thinking indicator for this chat when streaming starts
              setThinkingChatIds((prev) => {
                const next = new Set(prev);
                next.delete(selectedId);
                return next;
              });
            }
            addMessage(selectedId, {
              emitter: "gpt",
              message,
            });
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                if (selectedId) {
                  setStreamingChatIds((prev) => {
                    const next = new Set(prev);
                    next.delete(selectedId);
                    return next;
                  });
                  // clear controller for this chat
                  controllersRef.current.delete(selectedId);
                }
                // handle empty/blank responses
                if (!message.trim()) {
                  editMessage(selectedId, "I apologize, but I'm not sure how to respond to that. Could you please provide more context or rephrase your question?");
                }
                break;
              }
              
              let chunk = decoder.decode(value, { stream: true });
              message += chunk;
              
              if (selectedChat) {
                editMessage(selectedId, message);
                if (autoScrollEnabled && !userHasScrolledRef.current) {
                  requestAnimationFrame(() => {
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                    }
                  });
                }
              }
            }

            if (selectedRole == "New chat" || selectedRole == undefined) {
              editChat(selectedId, { role: prompt });
            }
          }
        })
        .catch((error) => {
          console.error("Streaming error:", error);
          if (selectedId) {
            setStreamingChatIds((prev) => {
              const next = new Set(prev);
              next.delete(selectedId);
              return next;
            });
            controllersRef.current.delete(selectedId);
          }
          setAutoScrollEnabled(false);
          if (selectedId) {
            // hide thinking indicator on error for this chat
            setThinkingChatIds((prev) => {
              const next = new Set(prev);
              next.delete(selectedId);
              return next;
            });
          }
          
          // If the user manually stopped the request, don't add an error bubble
          const isAbortError = (error && (error.name === 'AbortError' || error.message?.includes('aborted')));
          if (!isAbortError) {
            // provide specific error messages
            let errorMessage = "I apologize, but I cannot assist with that request. Please try asking something else.";
            if (error.message === 'Server error') {
              errorMessage = "I apologize, but I cannot process that type of request. Please try asking something else that aligns with appropriate and constructive dialogue.";
            }
            addMessage(selectedId, {
              emitter: "error",
              message: errorMessage,
            });
          }
        });
    };

    if (selectedId) {
      if (prompt && !isLoading) {
        sendRequest(selectedId, selectedChat);
      }
    } else {
      addChat(sendRequest);
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current || isAutoScrollingRef.current) {
      isAutoScrollingRef.current = false;
      return;
    }
    
    const atBottom = isAtBottom();
    setShowScrollButton(!atBottom);
    
    if (!atBottom && selectedId && streamingChatIds.has(selectedId)) {
      userHasScrolledRef.current = true;
      setAutoScrollEnabled(false);
    } else if (atBottom && selectedId && streamingChatIds.has(selectedId)) {
      userHasScrolledRef.current = false;
      setAutoScrollEnabled(true);
    }
  };

  const scrollToBottom = () => {
    if (!scrollContainerRef.current) return;
    
    isAutoScrollingRef.current = true;
    scrollContainerRef.current.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: 'smooth'
    });

    // Reset user scroll tracking and enable auto-scroll
    userHasScrolledRef.current = false;
    setAutoScrollEnabled(true);
    setShowScrollButton(false);
  };

  const scrollToPosition = (position: number) => {
    if (!scrollContainerRef.current) return;
    
    isAutoScrollingRef.current = true;
    scrollContainerRef.current.scrollTo({
      top: position,
      behavior: 'smooth'
    });
  };

  const handleInputKeyDown = (value: string) => {
    if (isSendDisabled) return; // dont't submit if sending is disabled
    handleAsk({ input: value });
  };

  const trackEvent = async (eventType: string, properties: any) => {
    const uuid = getUuid();
    if (typeof properties === "string") {
      properties = { property: properties };
    }
    const event = {
      uuid,
      event: eventType,
      properties,
    };
    try {
      fetch(config.URL + "/api/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });
    } catch {}
  };

  const handleClearAll = () => {
    clearAll();
    setThinkingChatIds(new Set());
    setStreamingChatIds(new Set());
    // Abort any in-flight requests
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
  };
  
  useEffect(() => {
    const query = searchParams.get("query");
    if (query && query != "") {
      handleAsk({ input: query });
    }
  }, []);

  // Disable send only if current chat is streaming or thinking
  const isSendDisabled = !!(
    (selectedId && streamingChatIds.has(selectedId)) ||
    (selectedId && thinkingChatIds.has(selectedId))
  );

  return (
    <Stack width="full" height="full" backgroundColor="#343541">
      <Stack
        className="output-stack"
        maxWidth="768px"
        width="full"
        marginX="auto"
        overflow="auto"
        backgroundColor="#343541"
        onScroll={handleScroll}
        ref={scrollContainerRef}
        css={{
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: 'rgba(255, 255, 255, 0.3)',
          },
        }}
      >
        <Stack spacing={2} padding={2} height="full">
          {hasSelectedChat ? (
            <AnimatePresence initial={false}>
            {selectedChat.content.map(({ emitter, message, feedback }, key) => {
              const getAvatar = () => {
                switch (emitter) {
                  case "gpt":
                    return TayAvatar;
                  case "error":
                    return warning;
                  default:
                    return UserAvatar;
                }
              };

              const getMessage = () => {
                return message;
              };

              const setFeedback = (newFeedback: Feedback | undefined) => {
                const isDeselect = selectedChat.content[key].feedback === newFeedback;
                try {
                  fetch(config.URL + "/api/feedback", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      uuid: getUuid(),
                      session_id: selectedId,
                      msg_index: key,
                      feedback: isDeselect ? null : newFeedback
                    }),
                  });
                } catch {
                  return
                }
                if (isDeselect) {
                  selectedChat.content[key].feedback = undefined;
                } else {
                  selectedChat.content[key].feedback = newFeedback;
                }
                forceUpdate();
              };

              const messageId = `${selectedId}-${key}`;

              return (
                <Box
                  as={motion.div}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.65, 0.3, 0.9] }}
                  id={messageId}
                  key={key}
                  position="relative"
                >
                    <Stack
                    backgroundColor={emitter == "gpt" ? "#444654" : "transparent"}
                    position="relative"
                    spacing={0}
                  >
                    <Stack
                      direction="row"
                      padding={4}
                      rounded={8}
                      spacing={4}
                      alignItems="flex-start"
                    >
                      <Avatar
                        name={emitter}
                        boxSize={"54px"}
                        src={getAvatar()}
                      />
                      <Stack flex={1} spacing={0}>
                        <Box>
                          <Box
                            position="relative"
                            className="markdown-content"
                          >
                            <div className="markdown-wrapper">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a: ({ href, children }) => (
                                    <a
                                      href={href}
                                      onClick={() => trackEvent("citationLinkClick", href)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {children}
                                    </a>
                                  )
                                }}
                              >
                                {getMessage()}
                              </ReactMarkdown>
                            </div>
                          </Box>
                        </Box>
                      </Stack>
                    </Stack>
                    {emitter === "gpt" && (
                      <Stack
                        direction="row"
                        spacing={0}
                        align="end"
                        paddingRight={4}
                        paddingBottom={2}
                        style={{ justifyContent: "flex-end" }}
                      >
                        <IconButton
                          aria-label="thumbs-up"
                          icon={
                            <FiThumbsUp
                              style={{
                                fill: feedback === "up" ? "white" : "none",
                              }}
                            />
                          }
                          backgroundColor="transparent"
                          onClick={() => setFeedback("up")}
                          _hover={{ bg: 'whiteAlpha.200' }}
                        />
                        <IconButton
                          aria-label="thumbs-down"
                          icon={
                            <FiThumbsDown
                              style={{
                                fill: feedback === "down" ? "white" : "none",
                              }}
                            />
                          }
                          backgroundColor="transparent"
                          onClick={() => setFeedback("down")}
                          _hover={{ bg: 'whiteAlpha.200' }}
                        />
                      </Stack>
                    )}
                  </Stack>
                </Box>
              );
            })}
            </AnimatePresence>
          ) : (
            <Instructions onClick={(text) => setValue("input", text)} />
          )}
          {selectedId && thinkingChatIds.has(selectedId) && (
            <ThinkingIndicator />
          )}
        </Stack>
      </Stack>
      {showScrollButton && (
        <Box
          as={motion.div}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          position="fixed"
          bottom="220px"
          left="50%"
          transform={`translate(-50%, ${showScrollButton ? '0' : '100%'})`}
          zIndex={20}
        >
          <IconButton
            aria-label="Scroll to bottom"
            icon={<FiChevronDown />}
            onClick={() => {
              scrollToBottom();
            }}
            size="lg"
            colorScheme="gray"
            rounded="full"
            boxShadow="lg"
            backgroundColor="rgba(33, 37, 41, 0.8)"
            as={motion.button}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.96 }}
          />
        </Box>
      )}
      <Stack
        className="input-stack"
        padding={4}
        backgroundColor="#343541"
        justifyContent="center"
        alignItems="center"
        overflow="hidden"
        position="relative"
        zIndex={10}
      >
        <Stack maxWidth="768px" width="100%">
          <Input
            autoFocus={true}
            variant="filled"
            isSendDisabled={isSendDisabled}
            inputLeftAddon={
              <IconButton
                aria-label="new_convo_button"
                icon={<FiRefreshCcw />}
                backgroundColor="transparent"
                onClick={handleClearAll}
              />
            }
            inputRightAddon={
              selectedId && (streamingChatIds.has(selectedId) || thinkingChatIds.has(selectedId)) ? (
                <IconButton
                  aria-label="stop_generating"
                  icon={<FiSquare />}
                  backgroundColor="transparent"
                  onClick={() => {
                    const controller = selectedId ? controllersRef.current.get(selectedId) : undefined;
                    if (controller) controller.abort();
                  }}
                />
              ) : (
                <IconButton
                  aria-label="send_button"
                  icon={!isLoading ? <FiSend /> : <Spinner />}
                  backgroundColor="transparent"
                  onClick={handleSubmit(handleAsk)}
                  isDisabled={isSendDisabled}
                />
              )
            }
            {...register("input")}
            onSubmit={handleInputKeyDown}
            backgroundColor="whiteAlpha.100"
          />
          <Text
            className="disclaimer"
            textAlign="center"
            fontSize="sm"
            opacity={0.8}
            lineHeight="1"
            marginTop="-4px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <a
              href="https://forms.gle/zRBnuBA58QCDCqcX7"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              <u>Submit your feedback</u>
            </a>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>&nbsp;to help us improve.</span>
          </Text>
        </Stack>
      </Stack>
      <div className="extrapad"></div>
    </Stack>
  );
};
