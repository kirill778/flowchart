import React, { useState, useRef, useCallback, useEffect } from 'react';
import { BarChart as FlowChart, Loader, Send, User, Bot, Plus, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
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
  MarkerType,
  NodeMouseHandler,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Упрощенный стиль для узлов
const nodeDefaultStyle = {
  background: '#ffffff', // Белый фон
  color: '#1f2937', // Темно-серый текст
  border: '1px solid #9ca3af', // Серая рамка
  borderRadius: '4px', // Меньше скругление
  width: 180, // Немного уже
  minHeight: 60, // Немного ниже
  padding: '8px 10px', // Меньше вертикальные отступы
};

function FlowchartApp() {
  const [input, setInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'direct' | 'chat'>('direct');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [modelType, setModelType] = useState<'gemini' | 'ollama'>('ollama');
  const [ollamaStatus, setOllamaStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
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

  // Состояние для редактирования узла
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  
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
        type: 'straight', // Используем прямые линии вместо smoothstep
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#dc2626', // Используем красный цвет для заметности
        },
        style: { 
          stroke: '#ef4444', // Красный цвет линии
          strokeWidth: 3,    // Толщина линии
          zIndex: 1000       // Поднимаем наверх
        }
      }, eds)
    );
  }, [setEdges]);

  // Обработчик для начала редактирования узла при двойном клике
  const onNodeDoubleClick: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    setEditingNode(node.id);
    setEditingText(node.data.label);
  }, []);

  // Обработчик для обновления текста узла
  const updateNodeText = useCallback(() => {
    if (!editingNode) return;

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === editingNode) {
          // Сохраняем существующие обработчики при обновлении данных узла
          const currentHandlers = {
            onEdit: node.data.onEdit,
            onDelete: node.data.onDelete
          };
          
          return {
            ...node,
            data: { 
              label: editingText,
              onEdit: currentHandlers.onEdit,
              onDelete: currentHandlers.onDelete
            },
          };
        }
        return node;
      })
    );
    setEditingNode(null);
  }, [editingNode, editingText, setNodes]);

  // Функция для удаления узла
  const deleteNode = useCallback((nodeId: string) => {
    // Удаляем узел
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    
    // Удаляем связанные с узлом рёбра
    setEdges((eds) => 
      eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    );
  }, [setNodes, setEdges]);

  // Функция для создания нового узла
  const addNode = () => {
    const id = `node-${nextNodeId}`;
    const newNode: Node = {
      id,
      type: 'default',
      position: { x: 100, y: nextNodeId * 100 },
      data: { 
        label: 'Новый блок',
        onEdit: () => {
          setEditingNode(id);
          setEditingText('Новый блок');
        },
        onDelete: () => deleteNode(id)
      },
      style: nodeDefaultStyle,
    };

    setNodes((nds) => [...nds, newNode]);
    setNextNodeId(nextNodeId + 1);
  };

  // Функция для переорганизации существующей блок-схемы (вертикально/горизонтально)
  const rearrangeFlowchart = (isHorizontal: boolean = false) => {
    if (nodes.length === 0) return;
    
    console.log(`Переорганизация блок-схемы в ${isHorizontal ? 'горизонтальный' : 'вертикальный'} вид`);
    
    const nodeWidth = 180; // Более компактная ширина
    const nodeHeight = 70; // Более компактная высота
    const gap = 80;        // Меньший отступ между блоками
    
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
    
    // Пересоздаем соединения между узлами
    const newEdges: Edge[] = [];
    
    // Добавляем соединения между последовательными узлами
    for (let i = 0; i < updatedNodes.length - 1; i++) {
      const sourceId = updatedNodes[i].id;
      const targetId = updatedNodes[i + 1].id;
      
      const edge: Edge = {
        id: `edge-${i}-${i+1}`,
        source: sourceId,
        target: targetId,
        type: 'default',
        animated: true,
        label: '',
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 4,
        style: { 
          stroke: '#2563eb',
          strokeWidth: 4
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 25,
          height: 25,
          color: '#2563eb',
        }
      };
      
      newEdges.push(edge);
    }
    
    // Обновляем положение узлов
    setNodes(updatedNodes);
    
    // Сначала очистим все соединения
    setEdges([]);
    
    // Затем через задержку добавим новые
    setTimeout(() => {
      console.log("Устанавливаю соединения после переорганизации:", newEdges);
      setEdges(newEdges);
      
      // И еще раз для надежности
      setTimeout(() => {
        if (newEdges.length > 0) {
          console.log("Повторная установка соединений после переорганизации");
          setEdges([...newEdges]);
        }
      }, 300);
    }, 200);
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
      let responseText: string;
      
      if (modelType === 'ollama') {
        // Используем локальный Ollama API
        apiUrl = `${OLLAMA_URL}/api/chat`;
        
        const systemPrompt = `Ты - помощник для создания блок-схем и диаграмм процессов.
Когда пользователь просит создать блок-схему или диаграмму, следуй этим правилам:
1. Всегда форматируй каждый шаг как "Шаг N: Описание шага", где N - номер шага.
2. Каждый шаг должен быть на отдельной строке.
3. Шаги должны быть короткими и ясными (не более 10-15 слов).
4. Для описания процесса используй от 2 до 7 шагов.
5. Шаги должны быть строго в формате "Шаг N: Описание", без дополнительных деталей.
6. В начале ответа допустимо коротко подтвердить, что создаешь схему.
7. НЕ ИСПОЛЬЗУЙ маркдаун, код или специальные форматы - только текст.

Пример хорошего ответа:

Хорошо, создаю схему приготовления чая.
Шаг 1: Вскипятить воду.
Шаг 2: Положить чайный пакетик в чашку.
Шаг 3: Залить кипятком.
Шаг 4: Дать настояться 5 минут.
Шаг 5: Добавить сахар по вкусу.`;
        
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: input }
        ];
        
        console.log("Sending request to Ollama...");
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
        responseText = data.message?.content || '';
        console.log("Ollama response:", responseText);
      } else {
        // Google Gemini API call
        // Обратите внимание: ниже просто заглушка, необходимо заменить реальным вызовом Gemini API
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_API_KEY`;
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Create a flowchart from this text. Return only the steps, one per line, each step formatted as "Step N: description":
                    ${input}`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024,
            }
          }),
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

      // ИЗВЛЕЧЕНИЕ ШАГОВ ИЗ ОТВЕТА МОДЕЛИ
      console.log("===== Обрабатываем ответ модели для создания блок-схемы =====");
      console.log("Полный ответ модели:", responseText);
      
      // Разбиваем ответ на строки
      const responseLines = responseText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      console.log("Все строки ответа:", responseLines);
      
      // Ищем строки в формате "Шаг N: текст"
      const stepLines: string[] = [];
      
      for (const line of responseLines) {
        // Используем регулярное выражение для извлечения шагов
        const match = line.match(/^шаг\s+(\d+)\s*:\s*(.+)$/i);
        if (match && match[2]) {
          const stepContent = match[2].trim();
          console.log(`Найден шаг ${match[1]}: "${stepContent}"`);
          stepLines.push(stepContent);
        }
      }
      
      console.log("Извлечено шагов:", stepLines.length, stepLines);
      
      // Если нашли хотя бы один шаг, создаем блок-схему
      if (stepLines.length > 0) {
        console.log("Создаем блок-схему из извлеченных шагов");
        generateFlowFromSteps(stepLines, isHorizontal);
      } else {
        console.log("Шаги не найдены, используем базовую обработку");
        
        // Если шаги не найдены, пробуем простой вариант - разбить по строкам
        if (responseLines.length > 1) {
          console.log("Используем строки как шаги:", responseLines);
          generateFlowFromSteps(responseLines, isHorizontal);
        } else {
          setError("Не удалось распознать шаги в ответе модели. Попробуйте изменить запрос.");
        }
      }
    } catch (fetchError) {
      console.error("Fetch error:", fetchError);
      
      // Fallback processing
      try {
        const fallbackSteps = input
          .split(/[\n\r\.\;\-]/)
          .map(line => line.trim())
          .filter(line => line.length > 3);
          
        if (fallbackSteps.length > 0) {
          console.log("Using fallback processing with user input:", fallbackSteps);
          generateFlowFromSteps(fallbackSteps, false);
          setError("Note: Using basic processing due to API connection issue. For better results, check your Ollama server.");
        } else {
          generateFlowFromSteps([input.trim()], false);
          setError("Unable to process input. Please check your Ollama server connection.");
        }
      } catch (processingError) {
        console.error("Processing error:", processingError);
        generateFlowFromSteps([input.trim()], false);
        setError("Error processing input. Using the entire text as a single step.");
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
    const nodeWidth = 180; // Более компактная ширина
    const nodeHeight = 70; // Более компактная высота
    const gap = 80;        // Меньший отступ между блоками
    
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
        data: { 
          label: step,
          onEdit: () => {
            console.log("Edit node called for:", id);
            setEditingNode(id);
            setEditingText(step);
          },
          onDelete: () => {
            console.log("Delete node called for:", id);
            deleteNode(id);
          }
        },
        style: nodeDefaultStyle,
      };
      
      newNodes.push(newNode);
    });
    
    // Создаем соединения между узлами отдельным циклом
    for (let i = 0; i < processedSteps.length - 1; i++) {
      const sourceId = `node-${i}`;
      const targetId = `node-${i + 1}`;
      
      const edge: Edge = {
        id: `edge-${i}-${i+1}`,
        source: sourceId,
        target: targetId,
        type: 'default', // Используем дефолтные линии для совместимости
        animated: true,  // Анимация для заметности
        label: '', // Пустой текст, чтобы создать якорь для стрелки
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 4,
        style: { 
          stroke: '#2563eb', // Синий цвет
          strokeWidth: 4,    // Толщина
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 25,
          height: 25,
          color: '#2563eb',
        }
      };
      
      console.log("Создаю соединение:", edge);
      newEdges.push(edge);
    }
    
    // Сделаем двойное обновление edges для надежности
    setNodes(newNodes);
    // Сначала очистим все соединения
    setEdges([]);
    
    // Затем через задержку добавим новые
    setTimeout(() => {
      console.log("Устанавливаю соединения:", newEdges);
      setEdges(newEdges);
      
      // И еще раз для надежности
      setTimeout(() => {
        if (newEdges.length > 0) {
          console.log("Повторная установка соединений");
          setEdges([...newEdges]);
        }
      }, 300);
    }, 200);
    
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
        data: { 
          label: node.text,
          onEdit: () => {
            setEditingNode(mainId);
            setEditingText(node.text);
          },
          onDelete: () => deleteNode(mainId)
        },
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
          data: { 
            label: node.right,
            onEdit: () => {
              setEditingNode(rightId);
              setEditingText(node.right || '');
            },
            onDelete: () => deleteNode(rightId)
          },
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
          data: { 
            label: node.below,
            onEdit: () => {
              setEditingNode(belowId);
              setEditingText(node.below || '');
            },
            onDelete: () => deleteNode(belowId)
          },
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
    
    // Добавляем сообщение пользователя в историю чата
    setChatHistory(prev => [...prev, userMessage]);
    setChatInput('');
    setLoading(true);
    
    try {
      let responseText = '';
      
      if (modelType === 'ollama') {
        // Используем локальный Ollama API
        const apiUrl = `${OLLAMA_URL}/api/chat`;
        
        const systemPrompt = `Ты - помощник для создания блок-схем и диаграмм процессов.
Когда пользователь просит создать блок-схему или диаграмму, следуй этим правилам:
1. Всегда форматируй каждый шаг как "Шаг N: Описание шага", где N - номер шага.
2. Каждый шаг должен быть на отдельной строке.
3. Шаги должны быть короткими и ясными (не более 10-15 слов).
4. Для описания процесса используй от 2 до 7 шагов.
5. Шаги должны быть строго в формате "Шаг N: Описание", без дополнительных деталей.
6. В начале ответа допустимо коротко подтвердить, что создаешь схему.
7. НЕ ИСПОЛЬЗУЙ маркдаун, код или специальные форматы - только текст.

Пример хорошего ответа:

Хорошо, создаю схему приготовления чая.
Шаг 1: Вскипятить воду.
Шаг 2: Положить чайный пакетик в чашку.
Шаг 3: Залить кипятком.
Шаг 4: Дать настояться 5 минут.
Шаг 5: Добавить сахар по вкусу.`;
        
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
      
      // Проверка ориентации
      const hasVerticalCommand = /верти(кальн|кал)/i.test(chatInput) || /верти(кальн|кал)/i.test(responseText);
      const hasHorizontalCommand = /гориз(онтальн|онтал)/i.test(chatInput) || /гориз(онтальн|онтал)/i.test(responseText);
      const isHorizontal = hasHorizontalCommand;
      
      // ИЗВЛЕЧЕНИЕ ШАГОВ ИЗ ОТВЕТА АССИСТЕНТА
      console.log("===== Обрабатываем ответ ассистента для создания блок-схемы =====");
      console.log("Полный ответ модели:", responseText);
      
      // Разбиваем ответ на строки
      const responseLines = responseText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      console.log("Все строки ответа:", responseLines);
      
      // Ищем строки в формате "Шаг N: текст"
      const stepLines: string[] = [];
      
      for (const line of responseLines) {
        // Используем более точное регулярное выражение для извлечения шагов
        const match = line.match(/^шаг\s+(\d+)\s*:\s*(.+)$/i);
        if (match && match[2]) {
          const stepContent = match[2].trim();
          console.log(`Найден шаг ${match[1]}: "${stepContent}"`);
          stepLines.push(stepContent);
        }
      }
      
      console.log("Извлечено шагов:", stepLines.length, stepLines);
      
      // Если нашли хотя бы один шаг, создаем блок-схему
      if (stepLines.length > 0) {
        console.log("Создаем блок-схему из извлеченных шагов");
        generateFlowFromSteps(stepLines, isHorizontal);
      } else {
        console.log("Шаги не найдены, не создаем блок-схему");
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

  // Создаем кастомный узел с кнопками редактирования и удаления
  const CustomNode = ({ id, data }: { id: string; data: any }) => {
    const handleEdit = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Editing node:", id);
      if (data.onEdit) data.onEdit();
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Deleting node:", id);
      if (data.onDelete) data.onDelete();
    };

    // Форматирование текста с переносами
    const formatText = (text: string) => {
      if (!text) return '';
      return text.split('\n').map((line, i) => (
        <React.Fragment key={i}>
          {line}
          {i < text.split('\n').length - 1 && <br />}
        </React.Fragment>
      ));
    };

    return (
      <div className="relative group bg-white rounded border border-gray-400 w-full h-full min-h-[60px] flex flex-col shadow-sm hover:shadow-md transition-shadow duration-150">
        {/* Упрощенные кнопки - появляются при наведении */}
        <div className="absolute right-0 top-0 flex opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            className="p-0.5 bg-gray-100 hover:bg-gray-200 rounded-bl-sm z-10"
            onClick={handleEdit}
            title="Редактировать"
          >
            <Edit className="w-3.5 h-3.5 text-gray-600" />
          </button>
          <button
            className="p-0.5 bg-red-100 hover:bg-red-200 rounded-tr-sm z-10"
            onClick={handleDelete}
            title="Удалить"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
          </button>
        </div>
        {/* Упрощенный текст */}
        <div className="p-2 flex-1 flex items-center justify-center text-center text-sm text-gray-700 overflow-hidden">
          {formatText(data.label)}
        </div>
      </div>
    );
  };

  // Используем useMemo для создания nodeTypes, чтобы он не пересоздавался при каждом рендере
  const nodeTypes = React.useMemo(() => ({ 
    default: CustomNode 
  }), []);

  // Создаем дефолтные узлы, если их нет
  React.useEffect(() => {
    if (nodes.length === 0 && edges.length === 0) {
      // Можно добавить приветственный узел
      const welcomeNode: Node = {
        id: 'welcome',
        type: 'default',
        position: { x: 250, y: 150 },
        data: { 
          label: 'Добро пожаловать! \nДобавьте новые блоки или создайте блок-схему с помощью чата или прямого ввода.',
          onEdit: () => {
            console.log("Welcome node edit called");
            setEditingNode('welcome');
            setEditingText('Добро пожаловать! \nДобавьте новые блоки или создайте блок-схему с помощью чата или прямого ввода.');
          },
          onDelete: () => {
            console.log("Welcome node delete called");
            deleteNode('welcome');
          }
        },
        style: { ...nodeDefaultStyle, width: 350 },
      };
      setNodes([welcomeNode]);
    }
  }, []);

  // Проверка состояния подключения к Ollama
  const checkOllamaConnection = useCallback(async () => {
    if (modelType !== 'ollama') return;
    
    try {
      setOllamaStatus('unknown');
      const response = await fetch(`${OLLAMA_URL}/api/tags`, { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        console.log("Ollama server is connected");
        setOllamaStatus('connected');
        setError('');
      } else {
        console.error("Ollama connection failed:", response.status);
        setOllamaStatus('disconnected');
        setError('Ошибка подключения к Ollama серверу. Убедитесь, что сервер запущен на http://localhost:11434');
      }
    } catch (e) {
      console.error("Ollama connection error:", e);
      setOllamaStatus('disconnected');
      setError('Ошибка подключения к Ollama серверу. Убедитесь, что сервер запущен на http://localhost:11434');
    }
  }, [modelType]);
  
  // Проверяем соединение при загрузке и при изменении типа модели
  useEffect(() => {
    checkOllamaConnection();
  }, [modelType, checkOllamaConnection]);

  // Обеспечиваем корректные соединения между узлами при их изменении
  useEffect(() => {
    // Если у нас есть хотя бы 2 узла, но нет соединений, восстанавливаем их
    if (nodes.length >= 2 && edges.length === 0) {
      console.log("Обнаружены узлы без соединений, восстанавливаем стрелки...");
      
      const newEdges: Edge[] = [];
      
      // Сортируем узлы по вертикальной или горизонтальной позиции
      const sortedNodes = [...nodes].sort((a, b) => {
        // Определяем ориентацию по расположению узлов
        const isHorizontal = Math.abs(a.position.y - b.position.y) < 50;
        
        if (isHorizontal) {
          return a.position.x - b.position.x;
        } else {
          return a.position.y - b.position.y;
        }
      });
      
      // Создаем соединения между последовательными узлами
      for (let i = 0; i < sortedNodes.length - 1; i++) {
        const edge: Edge = {
          id: `edge-auto-${i}-${i+1}`,
          source: sortedNodes[i].id,
          target: sortedNodes[i + 1].id,
          type: 'default',
          animated: true,
          style: { 
            stroke: '#2563eb',
            strokeWidth: 4
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 25,
            height: 25,
            color: '#2563eb',
          }
        };
        
        newEdges.push(edge);
      }
      
      // Устанавливаем соединения с задержкой
      if (newEdges.length > 0) {
        setTimeout(() => {
          console.log("Восстанавливаем соединения между узлами:", newEdges);
          setEdges(newEdges);
        }, 500);
      }
    }
  }, [nodes, edges, setEdges]);

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
            
            {/* Ollama connection status indicator */}
            {modelType === 'ollama' && (
              <div className="ml-2 flex items-center">
                {ollamaStatus === 'connected' && (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    <span className="text-xs">Подключено</span>
                  </div>
                )}
                {ollamaStatus === 'disconnected' && (
                  <div className="flex items-center text-red-600">
                    <XCircle className="w-4 h-4 mr-1" />
                    <span className="text-xs">Нет подключения</span>
                  </div>
                )}
                {ollamaStatus === 'unknown' && (
                  <div className="flex items-center text-gray-400">
                    <Loader className="w-4 h-4 mr-1 animate-spin" />
                    <span className="text-xs">Проверка...</span>
                  </div>
                )}
                <button 
                  onClick={checkOllamaConnection} 
                  className="ml-2 text-xs text-blue-600 underline"
                >
                  Проверить
                </button>
              </div>
            )}
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
          <div className="mt-8 rounded-md border border-gray-300 h-[60vh] relative">
            {/* Модальное окно для редактирования */}
            {editingNode && (
              <div className="absolute inset-0 bg-black bg-opacity-40 z-10 flex items-center justify-center">
                <div className="bg-white p-4 rounded-lg shadow-lg w-[80%] max-w-md">
                  <h3 className="text-lg font-semibold mb-2">Редактирование блока</h3>
                  <textarea
                    className="w-full h-32 border rounded p-2 mb-3"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
                      onClick={() => setEditingNode(null)}
                    >
                      Отмена
                    </button>
                    <button
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                      onClick={updateNodeText}
                    >
                      Сохранить
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={onNodeDoubleClick}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-right"
              defaultEdgeOptions={{
                type: 'default',
                animated: true,
                style: { strokeWidth: 4, stroke: '#2563eb' },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#2563eb',
                  width: 25,
                  height: 25,
                },
              }}
              connectionLineStyle={{ stroke: '#2563eb', strokeWidth: 3 }}
              elementsSelectable={true}
              snapToGrid={true}
              snapGrid={[10, 10]}
            >
              <Background color="#f0f0f0" gap={16} size={1} />
              <Controls />
              <MiniMap 
                nodeStrokeColor="#6B7280"
                nodeColor="#E5E7EB"
                nodeBorderRadius={2}
              />
            </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  );
}

// Обертка с ReactFlowProvider
function App() {
  return (
    <ReactFlowProvider>
      <FlowchartApp />
    </ReactFlowProvider>
  );
}

export default App;