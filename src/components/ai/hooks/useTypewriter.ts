// src/components/ai/hooks/useTypewriter.ts
import { useState, useEffect, useCallback, useRef } from 'react';

interface TypewriterOptions {
  loop?: boolean;
  typingSpeed?: number;
  deletingSpeed?: number;
  delayAfterTyping?: number;
}

const useTypewriter = (
  textToType: string,
  speed: number = 50, // characters per second, so interval is 1000/speed
  startPaused: boolean = true
) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(!startPaused);
  const [isFinished, setIsFinished] = useState(false);
  const currentIndexRef = useRef(0);
  const currentTextRef = useRef(textToType);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const typingInterval = 1000 / speed;

  const typeCharacter = useCallback(() => {
    if (currentIndexRef.current < currentTextRef.current.length) {
      setDisplayedText(
        (prev) => prev + currentTextRef.current[currentIndexRef.current]
      );
      currentIndexRef.current += 1;
      timerRef.current = setTimeout(typeCharacter, typingInterval);
    } else {
      setIsTyping(false);
      setIsFinished(true);
    }
  }, [typingInterval]);

  const startTyping = useCallback(() => {
    if (!isTyping && !isFinished) {
      setIsTyping(true);
      clearTimeout(timerRef.current!);
      timerRef.current = setTimeout(typeCharacter, typingInterval);
    }
  }, [isTyping, isFinished, typeCharacter, typingInterval]);

  const pauseTyping = useCallback(() => {
    setIsTyping(false);
    clearTimeout(timerRef.current!);
  }, []);

  const resetTypewriter = useCallback((newText: string) => {
    clearTimeout(timerRef.current!);
    currentTextRef.current = newText;
    setDisplayedText('');
    currentIndexRef.current = 0;
    setIsTyping(!startPaused);
    setIsFinished(false);
    if (!startPaused && newText.length > 0) {
        timerRef.current = setTimeout(typeCharacter, typingInterval);
    }
  }, [startPaused, typeCharacter, typingInterval]);

  useEffect(() => {
    currentTextRef.current = textToType; // Update if initial textToType prop changes
    resetTypewriter(textToType);
  }, [textToType, resetTypewriter]);


  useEffect(() => {
    if (isTyping && !isFinished && currentTextRef.current.length > 0) {
      timerRef.current = setTimeout(typeCharacter, typingInterval);
    }
    return () => clearTimeout(timerRef.current!);
  }, [isTyping, isFinished, typeCharacter, typingInterval]);

  return { displayedText, startTyping, pauseTyping, resetTypewriter, isFinished, isTyping };
};

export default useTypewriter;