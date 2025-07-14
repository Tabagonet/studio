
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import ReCaptchaProvider from '@/components/core/recaptcha-provider';

interface Message {
    id: string;
    role: 'user' | 'model';
    content: string;
}

function ChatbotComponent() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const { executeRecaptcha } = useGoogleReCaptcha();

    const startConversation = useCallback(async () => {
        if (messages.length > 0 || isLoading) {
            return;
        }

        setIsLoading(true);
        try {
            const recaptchaToken = executeRecaptcha ? await executeRecaptcha('chatbot_interaction') : 'not-available';
            
            const response = await fetch('/api/chatbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [], recaptchaToken })
            });

            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.error || 'Failed to start conversation');
            }
            
            const data = await response.json();
            setMessages([{ id: 'start-1', role: 'model', content: data.response }]);

        } catch (error: any) {
            toast({ title: "Error del Chatbot", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [executeRecaptcha, messages.length, isLoading, toast]);

    useEffect(() => {
        startConversation();
    }, [startConversation]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        if (!isLoading && !isComplete) {
            inputRef.current?.focus();
        }
    }, [messages, isLoading, isComplete]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading || isComplete) return;

        const userMessage: Message = { id: `user-${Date.now()}`, role: 'user', content: input };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
            const recaptchaToken = executeRecaptcha ? await executeRecaptcha('chatbot_interaction') : 'not-available';

            const response = await fetch('/api/chatbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                    recaptchaToken
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "El chatbot no pudo responder.");
            }

            const data = await response.json();
            
            if (data.isComplete) {
                setIsComplete(true);
            }
            const botMessage: Message = { id: `bot-${Date.now()}`, role: 'model', content: data.response };
            setMessages(prev => [...prev, botMessage]);

        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
            const errorMessage: Message = { id: `error-${Date.now()}`, role: 'model', content: "Lo siento, he encontrado un problema. Por favor, intenta de nuevo más tarde." };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
            <Card className="w-full max-w-2xl h-[90vh] flex flex-col shadow-2xl">
                <CardHeader className="flex flex-row items-center gap-4 border-b">
                    <Avatar>
                        <Image src="/images/logo.png" alt="Logo" width={40} height={40} className="rounded-full" />
                        <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <CardTitle>Asistente de Estrategia Digital</CardTitle>
                        <CardDescription>Responde a mis preguntas para empezar.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="p-6 space-y-6">
                            {messages.map(message => (
                                <div key={message.id} className={cn("flex items-start gap-3", message.role === 'user' && "justify-end")}>
                                    {message.role === 'model' && (
                                        <Avatar className="h-8 w-8">
                                             <Image src="/images/logo.png" alt="Logo" width={32} height={32} className="rounded-full" />
                                            <AvatarFallback>AI</AvatarFallback>
                                        </Avatar>
                                    )}
                                    <div className={cn(
                                        "max-w-xs md:max-w-md rounded-2xl px-4 py-3 text-sm whitespace-pre-line",
                                        message.role === 'model' ? "bg-muted text-foreground rounded-tl-none" : "bg-primary text-primary-foreground rounded-br-none"
                                    )}>
                                        {message.content}
                                    </div>
                                    {message.role === 'user' && (
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback>TÚ</AvatarFallback>
                                        </Avatar>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex items-start gap-3">
                                     <Avatar className="h-8 w-8">
                                          <Image src="/images/logo.png" alt="Logo" width={32} height={32} className="rounded-full" />
                                        <AvatarFallback>AI</AvatarFallback>
                                    </Avatar>
                                    <div className="max-w-xs md:max-w-md rounded-2xl px-4 py-3 text-sm bg-muted rounded-tl-none flex items-center">
                                       <Loader2 className="h-5 w-5 animate-spin"/>
                                    </div>
                                </div>
                            )}
                             <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>
                </CardContent>
                <CardFooter className="border-t p-4 flex flex-col gap-3">
                    {!isComplete ? (
                         <form onSubmit={handleSendMessage} className="w-full flex items-center gap-2">
                            <Input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder="Escribe tu respuesta..."
                                disabled={isLoading || isComplete}
                            />
                            <Button type="submit" size="icon" disabled={isLoading || isComplete || !input.trim()}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    ) : null}
                     <div className="text-xs text-center text-muted-foreground w-full">
                        Puedes consultar nuestros{' '}
                        <Link href="/terms" className="underline hover:text-primary">
                            Términos de Servicio
                        </Link>
                        ,{' '}
                        <Link href="/privacy" className="underline hover:text-primary">
                            Política de Privacidad
                        </Link>
                        {' y '}
                        <Link href="/cookies" className="underline hover:text-primary">
                            Política de Cookies
                        </Link>
                        .
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}

export default function ChatbotPage() {
    return (
        <ReCaptchaProvider>
            <ChatbotComponent />
        </ReCaptchaProvider>
    );
}
