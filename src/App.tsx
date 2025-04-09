import React, { useState, useRef, useCallback } from 'react';
import { BarChart as FlowChart, Loader, Send, User, Bot, Plus } from 'lucide-react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Node,
  Edge,
  Connection,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Стандартный стиль для узлов
const nodeDefaultStyle = {
  background: '#f0f9ff',
  color: '#000000',
  border: '2px solid #3b82f6',
  borderRadius: '8px',
  width: 180,
  padding: 10,
};

function App() {
  const [input, setInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'direct' | 'chat'>('direct');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [modelType, setModelType] = useState<'gemini' | 'ollama'>('ollama');
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  
  // ReactFlow состояние
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nextNodeId, setNextNodeId] = useState(1);
  
  // Ollama settings
  const OLLAMA_URL = 'http://localhost:11434'; // URL локального сервера Ollama
  const OLLAMA_MODEL = 'gemma3:12b'; // Модель Gemma3 12B

  // Default to "us" region, can be changed as needed
  const region = "us";

  // Прокрутка чата вниз при добавлении новых сообщений
  React.useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Обработчик для добавления соединений между узлами
  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => 
      addEdge({
        ...params,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#3b82f6',
        },
        style: { stroke: '#3b82f6', strokeWidth: 2 }
      }, eds)
    );
  }, [setEdges]);

  // Функция для добавления нового узла
  const addNode = () => {
    const id = `node-${nextNodeId}`;
    const newNode: Node = {
      id,
      type: 'default',
      position: { x: 100, y: nextNodeId * 100 },
      data: { label: 'Новый блок' },
      style: nodeDefaultStyle,
    };

    setNodes((nds) => [...nds, newNode]);
    setNextNodeId(nextNodeId + 1);
  };

  // Функция для переорганизации существующей блок-схемы (вертикально/горизонтально)
  const rearrangeFlowchart = (isHorizontal: boolean = false) => {
    if (nodes.length === 0) return;
    
    console.log(`Переорганизация блок-схемы в ${isHorizontal ? 'горизонтальный' : 'вертикальный'} вид`);
    
    const nodeWidth = 200;
    const nodeHeight = 80;
    const gap = 100;
    
    // Создаем новый массив узлов с обновленными позициями
    const updatedNodes = nodes.map((node, index) => {
      let newX, newY;
      
      if (isHorizontal) {
        // Горизонтальное расположение
        newX = index * (nodeWidth + gap) + 100;
        newY = 100;
      } else {
        // Вертикальное расположение
        newX = 250;
        newY = index * (nodeHeight + gap) + 50;
      }
      
      return {
        ...node,
        position: { x: newX, y: newY }
      };
    });
    
    // Обновляем положение узлов
    setNodes(updatedNodes);
  };

  const generateFlowchart = async () => {
    if (!input.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Для случая короткого ввода сразу используем базовую обработку
      if (input.trim().length < 5) {
        console.log("Input too short, using direct processing...");
        const directSteps = [input.trim()];
        generateFlowFromSteps(directSteps);
        setLoading(false);
        return;
      }
      
      // Проверяем, содержит ли текст горизонтальные связи через дефис
      let isHorizontal = false;
      if (input.includes('-')) {
        const testSteps = input
          .split('-')
          .filter(Boolean)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        if (testSteps.length > 1) {
          isHorizontal = true;
          console.log("Input contains horizontal flow with dashes, will render horizontally");
        }
      }

      console.log("Sending request to API...");
      
      let apiUrl: string;
      let requestBody: any;
      let responseText: string;
      
      if (modelType === 'ollama') {
        // Используем локальный Ollama API
        apiUrl = `${OLLAMA_URL}/api/chat`;
        
        // Подготавливаем инструкцию для Ollama
        const systemPrompt = `Ты - помощник для создания блок-схем. 
        Проанализируй текст пользователя и разбей его на логические шаги процесса, разделенные переносами строк.
        Если текст описывает процесс с шагами, выдели эти шаги в порядке их выполнения. 
        Возвращай ТОЛЬКО список шагов, по одному на строку, БЕЗ нумерации, дополнительных комментариев или описаний.`;
        
        requestBody = {
          model: OLLAMA_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input }
          ],
          stream: false
        };
        
        console.log("Sending request to Ollama...");
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        responseText = data.message?.content || '';
        console.log("Ollama response:", responseText);
      } else {
        // Google Gemini API call
        // Обратите внимание: ниже просто заглушка, необходимо заменить реальным вызовом Gemini API
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_API_KEY`;
        requestBody = {
          contents: [
            {
              parts: [
                {
                  text: `Create a flowchart from this text. Return only the steps, one per line, without numbering:
                  ${input}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          }
        };
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

      if (!response.ok) {
          throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      
      if (!responseText) {
        throw new Error('No text content in the API response');
      }

      const steps = responseText
        .split('\n')
        .filter(Boolean)
        .map((step: string) => step.trim())
        .filter((step: string) => step.length > 0);

      console.log("Processed steps:", steps);

      if (steps.length === 0) {
        throw new Error('No valid steps generated');
      }

      // Generate flowchart nodes from steps
      generateFlowFromSteps(steps, isHorizontal);
      
    } catch (fetchError) {
      console.error("Fetch error:", fetchError);
      
      // More robust fallback processing
      let fallbackSteps: string[] = [];
      let isHorizontal = false;
      let hasSpecialStructure = false;
      let flowchartStructure: Array<{ text: string, right?: string, below?: string }> = [];
      
      // Check for numbered list (1. Step One, 2. Step Two...)
      const numberedPattern = /^\d+\.\s+.+/;
      const numberedLines = input
        .split('\n')
        .filter(line => numberedPattern.test(line.trim()));
        
      if (numberedLines.length > 1) {
        console.log("Found numbered list format");
        fallbackSteps = numberedLines.map(line => 
          line.trim().replace(/^\d+\.\s+/, '')
        );
      } 
      
      // Check for bullet points
      else if (input.includes('•') || input.includes('*') || input.includes('-')) {
        console.log("Found bullet points format");
        fallbackSteps = input
          .split(/[•*-]/)
          .filter(Boolean)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        // For dash-separated format, make it horizontal
        if (input.includes('-') && !input.includes('•') && !input.includes('*')) {
          isHorizontal = true;
        }
      }
      
      // Check for sentences ending with periods
      else {
        console.log("Trying sentence-based parsing");
        
        // Split by periods, but be careful with numbers like 1.5
        // This regex looks for periods followed by a space or end of string
        const sentenceRegex = /\.\s+|\.\s*$/;
        const sentences = input.split(sentenceRegex);
        
        fallbackSteps = sentences
          .filter(Boolean)
          .map(s => s.trim())
          .filter(s => s.length > 0);
      }
      
      // Simple check for "A -> B" or "A → B" type connections
      if (input.includes('->') || input.includes('→')) {
        console.log("Found arrow notation, treating as horizontal flow");
        
        // Split by arrows
        const arrowSplit = input
          .split(/->|→/)
          .filter(Boolean)
          .map(s => s.trim())
          .filter(s => s.length > 0);
          
        if (arrowSplit.length > 1) {
          fallbackSteps = arrowSplit;
          isHorizontal = true;
        }
      }
      
      // Check for complex flow structure with "if/then" statements
      if (input.toLowerCase().includes('if') && 
          (input.toLowerCase().includes('then') || input.toLowerCase().includes('else'))) {
        console.log("Detected conditional flow");
        
        // Very simple parsing for simple if/then/else structures
        // This is a very basic implementation and won't catch all cases
        const lines = input.split('\n').filter(Boolean).map(line => line.trim());
        
        // Reset structure
        flowchartStructure = [];
        hasSpecialStructure = true;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();
          
          if (line.includes('if')) {
            // Current line has if
            const ifText = lines[i];
            
            // Check for then in this line or next
            if (i+1 < lines.length) {
              const thenText = lines[i+1];
              flowchartStructure.push({
                text: ifText,
                right: thenText.toLowerCase().includes('then') ? thenText : undefined,
                below: thenText.toLowerCase().includes('else') ? thenText : 
                      (i+2 < lines.length && lines[i+2].toLowerCase().includes('else')) ? 
                      lines[i+2] : undefined
              });
            } else {
              // Just add as a single node if there's no following line
              flowchartStructure.push({ text: ifText });
            }
          } else if (!line.includes('then') && !line.includes('else') && 
                    !lines[i-1]?.toLowerCase().includes('if')) {
            // Line that's not part of a conditional, add as standalone
            flowchartStructure.push({ text: lines[i] });
          }
          // Skip lines that are 'then' or 'else' as we've already handled them
        }
        
        console.log("Flow structure:", flowchartStructure);
      }
      
      // Check if we have a valid structure
      if (hasSpecialStructure && flowchartStructure.length > 0) {
        // Generate complex flowchart
        generateComplexFlowchart(flowchartStructure);
      } 
      // If no special structure but we have steps from fallback parsing
      else if (fallbackSteps.length > 0) {
        console.log("Using fallback steps:", fallbackSteps, "isHorizontal:", isHorizontal);
        generateFlowFromSteps(fallbackSteps, isHorizontal);
        setError("Note: Using basic processing due to API connection issue. For better results, check your internet connection.");
      } 
      // If no splits worked, just use the whole input as one step
      else {
        fallbackSteps = [input.trim()];
        generateFlowFromSteps(fallbackSteps, false);
        setError("Note: Using basic processing due to API connection issue. For better results, check your internet connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Функция для создания блок-схемы из шагов
  const generateFlowFromSteps = (steps: string[], isHorizontal: boolean = false) => {
    // Очищаем предыдущие узлы и соединения
    setNodes([]);
    setEdges([]);
    
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // Определяем общие размеры для расчета позиций
    const nodeWidth = 200;
    const nodeHeight = 80;
    const gap = 100;
    
    console.log(`Генерирую ${steps.length} блоков для шагов:`, steps);
    
    // Обработка шагов перед созданием блоков
    const processedSteps = steps.map(step => {
      // Удаляем mermaid синтаксис и любые markdown элементы
      return step
        .replace(/```mermaid|```/g, '')
        .replace(/graph\s+TD/i, '')
        .replace(/graph\s+LR/i, '')
        .trim();
    }).filter(step => step.length > 0);
    
    // Создаем узлы на основе шагов
    processedSteps.forEach((step, index) => {
      const id = `node-${index}`;
      
      let positionX, positionY;
      
      if (isHorizontal) {
        // Размещаем узлы горизонтально
        positionX = index * (nodeWidth + gap) + 100;
        positionY = 100;
      } else {
        // Размещаем узлы вертикально
        positionX = 250;
        positionY = index * (nodeHeight + gap) + 50;
      }
      
      // Создаем новый узел
      const newNode: Node = {
        id,
        type: 'default',
        position: { x: positionX, y: positionY },
        data: { label: step },
        style: nodeDefaultStyle,
      };
      
      newNodes.push(newNode);
      
      // Создаем соединение с предыдущим узлом
      if (index > 0) {
        const newEdge: Edge = {
          id: `edge-${index-1}-${index}`,
          source: `node-${index-1}`,
          target: id,
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: '#3b82f6',
          },
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        };
        
        newEdges.push(newEdge);
      }
    });
    
    // Устанавливаем новые узлы и соединения
    setNodes(newNodes);
    setEdges(newEdges);
    
    // Обновляем счетчик узлов для будущих ручных добавлений
    setNextNodeId(processedSteps.length + 1);
  };
  
  // Функция для создания сложной блок-схемы
  const generateComplexFlowchart = (structure: Array<{ text: string, right?: string, below?: string }>) => {
    // Очищаем предыдущие узлы и соединения
    setNodes([]);
    setEdges([]);
    
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // Определяем общие размеры для расчета позиций
    const nodeWidth = 200;
    const nodeHeight = 80;
    const gapX = 250;
    const gapY = 150;
    
    // Мапим индексы узлов для создания соединений
    const nodeMap: Record<string, string> = {};
    
    structure.forEach((node, index) => {
      // Основной узел
      const mainId = `node-${index}-main`;
      nodeMap[node.text] = mainId;
      
      newNodes.push({
        id: mainId,
        type: 'default',
        position: { x: 250, y: index * (nodeHeight + gapY) + 50 },
        data: { label: node.text },
        style: nodeDefaultStyle,
      });
      
      // Узел справа (если есть)
      if (node.right) {
        const rightId = `node-${index}-right`;
        nodeMap[node.right] = rightId;
        
        newNodes.push({
          id: rightId,
          type: 'default',
          position: { x: 250 + nodeWidth + gapX, y: index * (nodeHeight + gapY) + 50 },
          data: { label: node.right },
          style: nodeDefaultStyle,
        });
        
        // Соединение с узлом справа
        newEdges.push({
          id: `edge-${index}-right`,
          source: mainId,
          target: rightId,
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: '#3b82f6',
          },
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        });
      }
      
      // Узел снизу (если есть)
      if (node.below) {
        const belowId = `node-${index}-below`;
        nodeMap[node.below] = belowId;
        
        newNodes.push({
          id: belowId,
          type: 'default',
          position: { x: 250, y: index * (nodeHeight + gapY) + 50 + nodeHeight + gapY/2 },
          data: { label: node.below },
          style: nodeDefaultStyle,
        });
        
        // Соединение с узлом снизу
        newEdges.push({
          id: `edge-${index}-below`,
          source: mainId,
          target: belowId,
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: '#3b82f6',
          },
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        });
      }
      
      // Соединение с предыдущим основным узлом
      if (index > 0) {
        newEdges.push({
          id: `edge-${index-1}-${index}`,
          source: `node-${index-1}-main`,
          target: mainId,
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: '#3b82f6',
          },
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        });
      }
    });
    
    // Устанавливаем новые узлы и соединения
    setNodes(newNodes);
    setEdges(newEdges);
    
    // Обновляем счетчик узлов для будущих ручных добавлений
    setNextNodeId(newNodes.length + 1);
  };

  // Обработчик отправки сообщения в чате
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput
    };
    
    // Сначала проверим запрос пользователя на наличие упоминаний шагов
    const userSteps: string[] = [];
    const userInputText = chatInput.trim();
    
    // Поиск шагов в формате "Шаг 1", "Шаг 2", и т.д.
    const stepRegex = /Шаг\s+(\d+)/gi;
    let match;
    let matchFound = false;
    
    while ((match = stepRegex.exec(userInputText)) !== null) {
      matchFound = true;
      userSteps.push(`Шаг ${match[1]}`);
    }
    
    // Проверяем, содержит ли запрос команду изменения ориентации схемы
    const hasVerticalCommand = /верти(кальн|кал)/i.test(userInputText);
    const hasHorizontalCommand = /гориз(онтальн|онтал)/i.test(userInputText);
    
    // Если это команда изменения ориентации существующей схемы
    if (nodes.length > 0 && (hasVerticalCommand || hasHorizontalCommand)) {
      setChatHistory(prev => [...prev, userMessage]);
      setChatInput('');
      
      // Переорганизуем блок-схему
      rearrangeFlowchart(hasHorizontalCommand);
      
      // Добавляем ответ ассистента
      const systemResponse: ChatMessage = {
        role: 'assistant',
        content: `Готово! Блок-схема переорганизована в ${hasHorizontalCommand ? 'горизонтальный' : 'вертикальный'} вид.`
      };
      
      setChatHistory(prev => [...prev, systemResponse]);
      return;
    }
    
    setChatHistory(prev => [...prev, userMessage]);
    setChatInput('');
    setLoading(true);
    
    try {
      let responseText = '';
      
      if (modelType === 'ollama') {
        // Используем локальный Ollama API
        const apiUrl = `${OLLAMA_URL}/api/chat`;
        
        const systemPrompt = "Ты - помощник для создания блок-схем, диаграмм процессов. " + 
                           "Помогай пользователю анализировать процессы и разбивать их на шаги. " +
                           "Если пользователь упоминает конкретные шаги (например, 'Шаг 1', 'Шаг 2'), трактуй это буквально, " +
                           "не пытайся интерпретировать это как просьбу объяснить процесс. " +
                           "Если пользователь просит создать блок-схему с конкретными шагами, просто подтверди, что создаешь эти конкретные шаги. " +
                           "Не используй mermaid или другие специальные форматы кода в ответе - просто указывай шаги обычным текстом.";
        
        const messages = [
          { role: "system", content: systemPrompt },
          ...chatHistory.map(msg => ({ role: msg.role, content: msg.content })),
          { role: "user", content: chatInput }
        ];
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: messages,
            stream: false
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        responseText = data.message?.content || 'Извините, не удалось получить ответ.';
      } else {
        // Заглушка для Google Gemini API
        responseText = "Извините, в данный момент API Google Gemini не настроен. Используйте Ollama.";
      }
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: responseText
      };
      
      setChatHistory(prev => [...prev, assistantMessage]);
      
      // Проверяем, содержит ли запрос или ответ команду изменения ориентации
      if (hasVerticalCommand || hasHorizontalCommand || 
          /вертик/i.test(responseText) || /гориз/i.test(responseText)) {
        
        // Если у нас есть существующие блоки, меняем их ориентацию
        if (nodes.length > 0) {
          rearrangeFlowchart(hasHorizontalCommand || /гориз/i.test(responseText));
        }
      }
      
      // Если в запросе пользователя были найдены упоминания шагов, используем их напрямую
      if (matchFound && userSteps.length > 0) {
        console.log("Создаю блок-схему на основе шагов из запроса пользователя:", userSteps);
        // Очищаем предыдущие блоки и создаем новые на основе найденных шагов
        generateFlowFromSteps(userSteps, hasHorizontalCommand);
      } else if (userInputText.toLowerCase().includes('шаг') && 
                !(/шаг\s+\d+/i.test(userInputText))) {
        // Если пользователь упоминает слово "шаг", но не в формате "Шаг N", используем весь текст
        console.log("Создаю один блок с полным текстом запроса:", userInputText);
        generateFlowFromSteps([userInputText], hasHorizontalCommand);
      } else {
        // Если не нашли шаги в запросе пользователя, анализируем ответ ассистента

        // Сначала проверим на наличие шагов формата "Шаг N" в ответе
        const stepRgxInResponse = /Шаг\s+(\d+)/gi;
        const matches: RegExpExecArray[] = [];
        let stepMatch;
        
        // Собираем все совпадения в массив
        while ((stepMatch = stepRgxInResponse.exec(responseText)) !== null) {
          matches.push(stepMatch);
        }
        
        if (matches.length > 0) {
          console.log("Найдены упоминания шагов в ответе:", matches.length);
          
          // Если нашли шаги формата "Шаг N", проверяем, есть ли у них описание
          const steps: string[] = [];
          const lines = responseText.split('\n').map(line => line.trim()).filter(Boolean);
          
          if (lines.length > matches.length) {
            // Есть больше строк чем шагов - вероятно, есть описания
            for (const line of lines) {
              if (line.length > 0 && !line.startsWith('```')) {
                steps.push(line);
              }
            }
          } else {
            // Если строк меньше или столько же, просто используем найденные шаги
            for (const match of matches) {
              steps.push(match[0]); // match[0] содержит полное совпадение, например "Шаг 1"
            }
          }
          
          console.log("Создаю блок-схему на основе обработанных строк:", steps);
          generateFlowFromSteps(steps, hasHorizontalCommand);
        } else {
          // Если не нашли упоминания шагов, пробуем разбить текст по переносам строк
          const steps = responseText
            .split('\n')
            .filter(Boolean)
            .map((step: string) => step.trim())
            .filter((step: string) => 
              step.length > 0 && 
              !step.startsWith('```') && 
              !step.startsWith('`mermaid') && 
              !step.startsWith('graph') && 
              !step.startsWith('A[') && 
              step !== '"mermaid"'
            );
          
          if (steps.length > 0) {
            console.log("Создаю блок-схему на основе строк ответа:", steps);
            generateFlowFromSteps(steps, hasHorizontalCommand);
          } else if (responseText.trim().length > 0) {
            // Если после фильтрации не осталось шагов, но есть текст, используем весь текст
            console.log("Создаю один блок с ответом ассистента");
            generateFlowFromSteps([responseText.trim()], hasHorizontalCommand);
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      
      // Добавляем сообщение об ошибке
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, проверьте подключение к Ollama и убедитесь, что сервер запущен.'
      };
      
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Вспомогательная функция для экранирования HTML
  const escapeHtml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center gap-3 mb-8">
          <FlowChart className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Text to Flowchart</h1>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* Model Selector */}
          <div className="mb-4 flex items-center justify-end">
            <span className="text-sm text-gray-600 mr-2">Модель:</span>
            <select 
              value={modelType}
              onChange={(e) => setModelType(e.target.value as 'gemini' | 'ollama')}
              className="text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              <option value="ollama">Ollama (Gemma3 12B)</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          {/* Tabs */}
          <div className="flex border-b mb-6">
            <button 
              className={`py-2 px-4 font-medium ${activeTab === 'direct' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('direct')}
            >
              Прямой ввод
            </button>
            <button 
              className={`py-2 px-4 font-medium ${activeTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('chat')}
            >
              Чат с ИИ
            </button>
          </div>

          {/* Content for Direct Input Tab */}
          {activeTab === 'direct' && (
            <div>
          <div className="mb-6">
            <label htmlFor="input" className="block text-sm font-medium text-gray-700 mb-2">
              Enter your process description
            </label>
            <textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter a process description and I'll create a flowchart..."
            />
          </div>

              <div className="flex space-x-2">
          <button
            onClick={generateFlowchart}
            disabled={loading || !input.trim()}
                  className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Flowchart'
            )}
          </button>

                <button
                  onClick={addNode}
                  className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add Node
                </button>
              </div>
            </div>
          )}

          {/* Content for Chat Tab */}
          {activeTab === 'chat' && (
            <div>
              <div 
                ref={chatMessagesRef}
                className="border border-gray-200 rounded-md p-4 h-80 overflow-y-auto mb-4 bg-gray-50 flex flex-col space-y-4"
              >
                {chatHistory.length === 0 ? (
                  <div className="text-gray-400 text-center italic mt-32">
                    Начните общение с ассистентом для создания блок-схем
                  </div>
                ) : (
                  chatHistory.map((message, index) => (
                    <div 
                      key={index} 
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.role === 'user' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-white text-gray-800 border border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {message.role === 'user' ? 
                            <User className="w-4 h-4" /> : 
                            <Bot className="w-4 h-4" />
                          }
                          <span className="font-semibold">
                            {message.role === 'user' ? 'Вы' : 'Ассистент'}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                <textarea 
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Спросите что-нибудь о создании блок-схем..." 
                  className="flex-grow px-3 py-2 focus:outline-none resize-none h-12"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={loading || !chatInput.trim()}
                  className="bg-blue-600 text-white p-3 h-12 w-12 flex items-center justify-center disabled:opacity-50"
                >
                  {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 text-red-500 text-sm">{error}</div>
          )}

          {/* ReactFlow Canvas */}
          <div className="mt-8 rounded-md border border-gray-300 h-[60vh]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              fitView
              attributionPosition="bottom-right"
            >
              <Controls />
              <MiniMap />
              <Background />
            </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;