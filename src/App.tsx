import React, { useState, useRef } from 'react';
import { BarChart as FlowChart, Loader, Send, User, Bot } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function App() {
  const [input, setInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'direct' | 'chat'>('direct');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [modelType, setModelType] = useState<'gemini' | 'ollama'>('ollama');
  const diagramRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  
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

  const generateFlowchart = async () => {
    if (!input.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Для случая короткого ввода сразу используем базовую обработку
      if (input.trim().length < 5) {
        console.log("Input too short, using direct processing...");
        const directSteps = [input.trim()];
        renderSvgFlowchart(directSteps);
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
      
      try {
        let responseText = '';
        
        if (modelType === 'ollama') {
          // Использование Ollama API
          console.log("Using Ollama model:", OLLAMA_MODEL);
          
          const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: OLLAMA_MODEL,
              prompt: `Convert this text into a sequence of steps for a flowchart. Return only the steps, one per line, without any additional text or formatting: ${input}`,
              stream: false
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error("API response error:", response.status, errorText);
            throw new Error(`Failed to connect to Ollama API: ${response.status} ${errorText}`);
          }
          
          const data = await response.json();
          console.log("Ollama response:", data);
          
          if (!data.response) {
            throw new Error('No response from Ollama API');
          }
          
          responseText = data.response;
        } else {
          // Использование Google Gemini API (оставляем как запасной вариант)
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
          if (!apiKey) {
            throw new Error('Gemini API key is not configured');
          }
          
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `Convert this text into a sequence of steps for a flowchart. Return only the steps, one per line, without any additional text or formatting: ${input}`
                  }]
                }]
              }),
            }
          );
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error("API response error:", response.status, errorText);
            throw new Error(`Failed to connect to Gemini API: ${response.status} ${errorText}`);
          }
          
          const data = await response.json();
          
          if (!data.candidates || data.candidates.length === 0 || 
              !data.candidates[0].content || !data.candidates[0].content.parts || 
              data.candidates[0].content.parts.length === 0) {
            console.error("Invalid response structure:", data);
            throw new Error('Invalid response structure from Gemini API');
          }
          
          // Extract the text from the content parts
          for (const part of data.candidates[0].content.parts) {
            if (part.text) {
              responseText += part.text;
            }
          }
        }
        
        console.log("Extracted text:", responseText);
        
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

        // Generate SVG flowchart
        renderSvgFlowchart(steps, isHorizontal);
        
      } catch (fetchError) {
        console.error("Fetch error:", fetchError);
        
        // More robust fallback processing
        let fallbackSteps: string[] = [];
        let isHorizontal = false;
        let hasSpecialStructure = false;
        let flowchartStructure: Array<{ text: string, right?: string, below?: string }> = [];
        
        // Строим структуру блок-схемы с учетом специальных символов
        // Сначала проверяем, есть ли у нас сложная структура с обоими символами - и |
        if (input.includes('-') || input.includes('|')) {
          hasSpecialStructure = true;
          // Разбиваем ввод на строки
          const lines = input.split('\n');
          
          // Обрабатываем каждую строку
          let currentNode: {text: string, right?: string, below?: string} = {text: ''};
          flowchartStructure = [];
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            if (trimmedLine.includes('-') && !trimmedLine.startsWith('-')) {
              // Горизонтальная связь (справа)
              const [nodeText, rightText] = trimmedLine.split('-').map(s => s.trim());
              if (nodeText && rightText) {
                currentNode = {text: nodeText, right: rightText};
                flowchartStructure.push(currentNode);
              }
            } else if (trimmedLine.includes('|') && !trimmedLine.startsWith('|')) {
              // Вертикальная связь (снизу)
              const [nodeText, belowText] = trimmedLine.split('|').map(s => s.trim());
              if (nodeText && belowText) {
                currentNode = {text: nodeText, below: belowText};
                flowchartStructure.push(currentNode);
              }
            } else {
              // Обычный узел без связей
              currentNode = {text: trimmedLine};
              flowchartStructure.push(currentNode);
            }
          }
          
          console.log("Generated flowchart structure:", flowchartStructure);
          
          // Если есть специальная структура, передаем ее в SVG генератор
          if (flowchartStructure.length > 0) {
            renderSvgFlowchartComplex(flowchartStructure);
            setError("Using custom structure based on special symbols - and |");
            setLoading(false);
            return;
          }
        }
        
        // Если специальная структура не обнаружена или не удалось ее построить,
        // продолжаем с обычной обработкой (как было раньше)
        // Проверяем, содержит ли текст горизонтальные связи через дефис
        if (input.includes('-')) {
          isHorizontal = true;
          fallbackSteps = input
            .split('-')
            .filter(Boolean)
            .map(s => s.trim())
            .filter(s => s.length > 0);
          
          if (fallbackSteps.length > 1) {
            console.log("Detected horizontal flow with dashes", fallbackSteps);
          } else {
            isHorizontal = false;
          }
        }
        
        // Если не обнаружены горизонтальные связи, используем стандартные разделители
        if (!isHorizontal || fallbackSteps.length <= 1) {
          isHorizontal = false;
          
          // Try different splits based on the content
          if (input.includes('.')) {
            fallbackSteps = input
              .split('.')
              .filter(Boolean)
              .map(s => s.trim())
              .filter(s => s.length > 0);
          } else if (input.includes('\n')) {
            fallbackSteps = input
              .split('\n')
              .filter(Boolean)
              .map(s => s.trim()) 
              .filter(s => s.length > 0);
          } else if (input.includes(',')) {
            fallbackSteps = input
              .split(',')
              .filter(Boolean)
              .map(s => s.trim())
              .filter(s => s.length > 0);
          }
        }
        
        // If no splits worked, just use the whole input as one step
        if (fallbackSteps.length === 0) {
          fallbackSteps = [input.trim()];
        }
         
        console.log("Using fallback steps:", fallbackSteps, "isHorizontal:", isHorizontal);
        
        if (fallbackSteps.length > 0) {
          renderSvgFlowchart(fallbackSteps, isHorizontal);
          setError("Note: Using basic processing due to API connection issue. For better results, check your internet connection.");
        } else {
          throw new Error("Failed to process input: Network error and insufficient input for fallback processing");
        }
      }
    } catch (e) {
      console.error('Flowchart generation error:', e);
      setError(
        e instanceof Error 
          ? e.message
          : 'Failed to generate flowchart. Check your internet connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Функция для отправки сообщения в чате
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput
    };

    // Добавляем сообщение пользователя в историю
    setChatHistory(prev => [...prev, userMessage]);
    setChatInput('');
    setLoading(true);

    try {
      let aiResponse = '';
      
      if (modelType === 'ollama') {
        // Использование Ollama API для чата
        const messages = chatHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));
        
        // Добавляем текущее сообщение
        messages.push({
          role: 'user',
          content: chatInput
        });
        
        // Добавляем системный промпт
        const systemPrompt = `Ты помощник по созданию блок-схем. Анализируй запросы пользователя и помогай создавать блок-схемы. 
        Если пользователь просит создать блок-схему, ответь текстом в специальном формате для отображения:
        FLOWCHART:
        Шаг 1
        Шаг 2
        Шаг 3
        
        Или, если пользователь хочет блок-схему с горизонтальными и вертикальными связями:
        COMPLEX_FLOWCHART:
        Блок A - Блок B
        Блок A | Блок C
        Блок C - Блок D
        
        Во всех остальных случаях отвечай как обычный помощник.`;
        
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            stream: false
          })
        });
        
        if (!response.ok) {
          throw new Error(`Error connecting to Ollama: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Ollama chat response:", data);
        
        if (!data.message || !data.message.content) {
          throw new Error('Invalid response from Ollama');
        }
        
        aiResponse = data.message.content;
      } else {
        // Gemini API (оставляем как запасной вариант)
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error('API key is not configured');
        }
  
        // Формируем историю сообщений для контекста
        const messages = chatHistory.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.content }]
        }));
  
        // Добавляем текущее сообщение пользователя
        messages.push({
          role: 'user',
          parts: [{ text: chatInput }]
        });
  
        // Строим промпт с инструкциями для модели
        const systemPrompt = {
          role: 'system',
          parts: [{ 
            text: `Ты помощник по созданию блок-схем. Анализируй запросы пользователя и помогай создавать блок-схемы. 
            Если пользователь просит создать блок-схему, ответь текстом в специальном формате для отображения:
            FLOWCHART:
            Шаг 1
            Шаг 2
            Шаг 3
            
            Или, если пользователь хочет блок-схему с горизонтальными и вертикальными связями:
            COMPLEX_FLOWCHART:
            Блок A - Блок B
            Блок A | Блок C
            Блок C - Блок D
            
            Во всех остальных случаях отвечай как обычный помощник.`
          }]
        };
  
        // Добавляем системный промпт в начало сообщений
        const requestMessages = [systemPrompt, ...messages];
  
        // Отправляем запрос к API
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: requestMessages
            }),
          }
        );
  
        if (!response.ok) {
          throw new Error(`Error connecting to AI: ${response.status}`);
        }
  
        const data = await response.json();
        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
          throw new Error('Invalid response from AI');
        }
  
        aiResponse = data.candidates[0].content.parts[0].text;
      }
      
      // Добавляем ответ ассистента в историю
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: aiResponse
      };
      
      setChatHistory(prev => [...prev, assistantMessage]);

      // Проверяем, содержит ли ответ ИИ инструкции для создания блок-схемы
      if (aiResponse.includes('FLOWCHART:')) {
        const flowchartText = aiResponse.split('FLOWCHART:')[1].trim();
        const steps = flowchartText
          .split('\n')
          .filter(Boolean)
          .map((step: string) => step.trim())
          .filter((step: string) => step.length > 0);

        if (steps.length > 0) {
          renderSvgFlowchart(steps);
        }
      } else if (aiResponse.includes('COMPLEX_FLOWCHART:')) {
        const flowchartText = aiResponse.split('COMPLEX_FLOWCHART:')[1].trim();
        
        // Создаем структуру для сложной блок-схемы
        let flowchartStructure: Array<{ text: string, right?: string, below?: string }> = [];
        const lines = flowchartText.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          if (trimmedLine.includes('-') && !trimmedLine.startsWith('-')) {
            // Горизонтальная связь (справа)
            const [nodeText, rightText] = trimmedLine.split('-').map((s: string) => s.trim());
            if (nodeText && rightText) {
              flowchartStructure.push({text: nodeText, right: rightText});
            }
          } else if (trimmedLine.includes('|') && !trimmedLine.startsWith('|')) {
            // Вертикальная связь (снизу)
            const [nodeText, belowText] = trimmedLine.split('|').map((s: string) => s.trim());
            if (nodeText && belowText) {
              flowchartStructure.push({text: nodeText, below: belowText});
            }
          } else {
            // Обычный узел без связей
            flowchartStructure.push({text: trimmedLine});
          }
        }
        
        if (flowchartStructure.length > 0) {
          renderSvgFlowchartComplex(flowchartStructure);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      // Добавляем сообщение об ошибке в историю
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: 'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // SVG flowchart renderer
  const renderSvgFlowchart = (steps: string[], isHorizontal: boolean = false): void => {
    const svgCode = generateSvgFlowchart(steps, isHorizontal);
    const element = diagramRef.current;
    if (element) {
      element.innerHTML = svgCode;
    }
  };

  // SVG flowchart renderer для сложных структур с горизонтальными и вертикальными связями
  const renderSvgFlowchartComplex = (structure: Array<{ text: string, right?: string, below?: string }>): void => {
    const svgCode = generateSvgFlowchartComplex(structure);
    const element = diagramRef.current;
    if (element) {
      element.innerHTML = svgCode;
    }
  };

  // Helper function to escape HTML special characters
  const escapeHtml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // SVG flowchart generator
  const generateSvgFlowchart = (steps: string[], isHorizontal: boolean = false): string => {
    const baseNodeWidth = 150;
    const baseNodeHeight = 60;
    const gap = 50;
    const charWidth = 8; // примерная ширина символа в пикселях
    const lineHeight = 20; // высота строки в пикселях
    const padding = 20; // отступ от текста до границы блока
    
    // Рассчитываем размеры всех узлов
    const nodeSizes = steps.map(step => {
      const lines = step.split('\n');
      const maxLineLength = Math.max(...lines.map(line => line.length));
      const width = Math.max(baseNodeWidth, maxLineLength * charWidth + padding * 2);
      const height = Math.max(baseNodeHeight, lines.length * lineHeight + padding * 2);
      return { width, height };
    });
    
    // Calculate total dimensions based on direction and node sizes
    let totalWidth, totalHeight;
    
    if (isHorizontal) {
      // For horizontal layout, sum all widths plus gaps
      totalWidth = nodeSizes.reduce((sum, size, i) => sum + size.width, 0) + 
                  (steps.length - 1) * gap + 100; // padding
      // Height is the maximum node height plus padding
      totalHeight = Math.max(...nodeSizes.map(s => s.height)) + 100;
    } else {
      // For vertical layout, width is the maximum node width plus padding
      totalWidth = Math.max(...nodeSizes.map(s => s.width)) + 100;
      // Height is the sum of all heights plus gaps
      totalHeight = nodeSizes.reduce((sum, size) => sum + size.height, 0) + 
                    (steps.length - 1) * gap + 100; // padding
    }
    
    let svgNodes = '';
    let svgConnectors = '';
    
    // Define arrow marker
    const arrowMarker = `
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
        </marker>
      </defs>
    `;
    
    // Generate nodes and connectors
    let currentX = 50; // starting X position
    let currentY = 50; // starting Y position
    
    steps.forEach((step, index) => {
      const { width, height } = nodeSizes[index];
      let x, y;
      
      if (isHorizontal) {
        // Position nodes in a horizontal line
        x = currentX;
        y = totalHeight / 2 - height / 2;
        currentX += width + gap; // move X for next node
      } else {
        // Position nodes in a vertical line
        x = totalWidth / 2 - width / 2;
        y = currentY;
        currentY += height + gap; // move Y for next node
      }
      
      // Create node rectangle
      svgNodes += `
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" ry="8" 
              fill="#f0f9ff" stroke="#3b82f6" stroke-width="2" />
      `;
      
      // Handle multiline text
      const lines = step.split('\n');
      if (lines.length === 1) {
        // Single line text
        svgNodes += `
          <text x="${x + width / 2}" y="${y + height / 2}" 
                font-family="Arial, sans-serif" font-size="14" text-anchor="middle" 
                dominant-baseline="middle" fill="#000000">
            ${escapeHtml(step)}
          </text>
        `;
      } else {
        // Multiline text
        const lineSpacing = Math.min(height / (lines.length + 1), lineHeight);
        lines.forEach((line, lineIndex) => {
          svgNodes += `
            <text x="${x + width / 2}" y="${y + (lineIndex + 1) * lineSpacing}" 
                  font-family="Arial, sans-serif" font-size="14" text-anchor="middle" 
                  dominant-baseline="middle" fill="#000000">
              ${escapeHtml(line)}
            </text>
          `;
        });
      }
      
      // Create connector to previous node
      if (index > 0) {
        const prevNodeSize = nodeSizes[index - 1];
        let startX, startY, endX, endY;
        
        if (isHorizontal) {
          // Horizontal connector
          startX = x - gap;
          startY = totalHeight / 2;
          endX = x;
          endY = totalHeight / 2;
        } else {
          // Vertical connector
          startX = totalWidth / 2;
          startY = y - gap;
          endX = totalWidth / 2;
          endY = y;
        }
        
        svgConnectors += `
          <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)" />
        `;
      }
    });
    
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
        ${arrowMarker}
        ${svgNodes}
        ${svgConnectors}
      </svg>
    `;
  };

  // SVG generator для сложных структур с горизонтальными и вертикальными связями
  const generateSvgFlowchartComplex = (structure: Array<{ text: string, right?: string, below?: string }>): string => {
    const baseNodeWidth = 150;
    const baseNodeHeight = 60;
    const gap = 70;
    const charWidth = 8; // примерная ширина символа в пикселях
    const lineHeight = 20; // высота строки в пикселях
    const padding = 20; // отступ от текста до границы блока
    
    // Собираем все уникальные тексты узлов
    const allNodeTexts = new Set<string>();
    structure.forEach(node => {
      allNodeTexts.add(node.text);
      if (node.right) allNodeTexts.add(node.right);
      if (node.below) allNodeTexts.add(node.below);
    });
    
    // Рассчитываем размеры для каждого текста
    const textSizes = new Map<string, {width: number, height: number}>();
    allNodeTexts.forEach(text => {
      const lines = text.split('\n');
      const maxLineLength = Math.max(...lines.map(line => line.length));
      const width = Math.max(baseNodeWidth, maxLineLength * charWidth + padding * 2);
      const height = Math.max(baseNodeHeight, lines.length * lineHeight + padding * 2);
      textSizes.set(text, { width, height });
    });
    
    // Рассчитываем размеры SVG на основе структуры
    // Упрощенная версия - мы строим сетку узлов
    const grid: Array<Array<{text: string, id: string, width: number, height: number}>> = [];
    
    // Заполняем первую строку основными узлами
    const firstRow: Array<{text: string, id: string, width: number, height: number}> = [];
    structure.forEach((node, index) => {
      const size = textSizes.get(node.text) || {width: baseNodeWidth, height: baseNodeHeight};
      firstRow.push({text: node.text, id: `node_${index}_0`, ...size});
    });
    grid.push(firstRow);
    
    // Добавляем узлы справа (горизонтальные)
    structure.forEach((node, rowIndex) => {
      if (node.right) {
        const size = textSizes.get(node.right) || {width: baseNodeWidth, height: baseNodeHeight};
        if (!grid[0][rowIndex + 1]) {
          // Если в первой строке нет узла справа, добавляем его
          firstRow.push({text: node.right, id: `node_${rowIndex}_right`, ...size});
        }
      }
    });
    
    // Добавляем узлы снизу (вертикальные)
    structure.forEach((node, colIndex) => {
      if (node.below) {
        const size = textSizes.get(node.below) || {width: baseNodeWidth, height: baseNodeHeight};
        if (!grid[1]) {
          // Если второй строки нет, создаем ее
          grid.push([]);
        }
        grid[1][colIndex] = {text: node.below, id: `node_${colIndex}_1`, ...size};
      }
    });
    
    // Определяем размеры сетки
    const cols = Math.max(...grid.map(row => row.length));
    
    // Рассчитываем максимальную ширину каждого столбца и высоту каждой строки
    const colWidths = Array(cols).fill(0);
    const rowHeights = Array(grid.length).fill(0);
    
    // Находим максимальную ширину для каждого столбца
    grid.forEach(row => {
      row.forEach((node, colIndex) => {
        if (node && colWidths[colIndex] < node.width) {
          colWidths[colIndex] = node.width;
        }
      });
    });
    
    // Находим максимальную высоту для каждой строки
    grid.forEach((row, rowIndex) => {
      row.forEach(node => {
        if (node && rowHeights[rowIndex] < node.height) {
          rowHeights[rowIndex] = node.height;
        }
      });
    });
    
    // Рассчитываем размер SVG
    const svgWidth = colWidths.reduce((sum, width) => sum + width, 0) + (cols + 1) * gap;
    const svgHeight = rowHeights.reduce((sum, height) => sum + height, 0) + (grid.length + 1) * gap;
    
    let svgNodes = '';
    let svgConnectors = '';
    
    // Определяем маркер для стрелок
    const arrowMarker = `
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
        </marker>
      </defs>
    `;
    
    // Создаем узлы
    // Рассчитываем позиции для каждого узла на основе максимальных размеров в сетке
    const nodePositions = new Map<string, {x: number, y: number, width: number, height: number}>();
    
    grid.forEach((row, rowIndex) => {
      let yPos = gap;
      // Добавляем высоты предыдущих строк
      for (let i = 0; i < rowIndex; i++) {
        yPos += rowHeights[i] + gap;
      }
      
      let xPos = gap;
      row.forEach((node, colIndex) => {
        if (node) {
          // Для позиции X, добавляем ширины предыдущих столбцов
          if (colIndex > 0) {
            xPos = gap;
            for (let i = 0; i < colIndex; i++) {
              xPos += colWidths[i] + gap;
            }
          }
          
          // Сохраняем позицию узла
          nodePositions.set(node.id, {
            x: xPos,
            y: yPos,
            width: node.width,
            height: node.height
          });
          
          // Создаем прямоугольник узла
          svgNodes += `
            <rect x="${xPos}" y="${yPos}" width="${node.width}" height="${node.height}" rx="8" ry="8" 
                  fill="#f0f9ff" stroke="#3b82f6" stroke-width="2" />
          `;
          
          // Обрабатываем многострочный текст
          const lines = node.text.split('\n');
          if (lines.length === 1) {
            // Однострочный текст
            svgNodes += `
              <text x="${xPos + node.width / 2}" y="${yPos + node.height / 2}" 
                    font-family="Arial, sans-serif" font-size="14" text-anchor="middle" 
                    dominant-baseline="middle" fill="#000000">
                ${escapeHtml(node.text)}
              </text>
            `;
          } else {
            // Многострочный текст
            const lineSpacing = Math.min(node.height / (lines.length + 1), lineHeight);
            lines.forEach((line, lineIndex) => {
              svgNodes += `
                <text x="${xPos + node.width / 2}" y="${yPos + (lineIndex + 1) * lineSpacing}" 
                      font-family="Arial, sans-serif" font-size="14" text-anchor="middle" 
                      dominant-baseline="middle" fill="#000000">
                  ${escapeHtml(line)}
                </text>
              `;
            });
          }
        }
      });
    });
    
    // Создаем соединения
    structure.forEach((node, index) => {
      const sourceNodeId = `node_${index}_0`;
      const sourcePos = nodePositions.get(sourceNodeId);
      
      if (!sourcePos) return;
      
      // Если у узла есть узел справа
      if (node.right) {
        const rightNodeIndex = index + 1;
        const targetNodeId = `node_${index}_right`;
        let targetPos = nodePositions.get(targetNodeId);
        
        // Если не нашли по ID, ищем по следующему индексу
        if (!targetPos) {
          targetPos = nodePositions.get(`node_${rightNodeIndex}_0`);
        }
        
        if (targetPos) {
          const startX = sourcePos.x + sourcePos.width;
          const startY = sourcePos.y + sourcePos.height / 2;
          const endX = targetPos.x;
          const endY = targetPos.y + targetPos.height / 2;
          
          svgConnectors += `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)" />
          `;
        }
      }
      
      // Если у узла есть узел снизу
      if (node.below) {
        const targetNodeId = `node_${index}_1`;
        const targetPos = nodePositions.get(targetNodeId);
        
        if (targetPos) {
          const startX = sourcePos.x + sourcePos.width / 2;
          const startY = sourcePos.y + sourcePos.height;
          const endX = targetPos.x + targetPos.width / 2;
          const endY = targetPos.y;
          
          svgConnectors += `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)" />
          `;
        }
      }
    });
    
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
        ${arrowMarker}
        ${svgNodes}
        ${svgConnectors}
      </svg>
    `;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
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

              <button
                onClick={generateFlowchart}
                disabled={loading || !input.trim()}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            </div>
          )}

          {/* Content for Chat Tab */}
          {activeTab === 'chat' && (
            <div>
              {/* Chat Messages */}
              <div 
                ref={chatMessagesRef}
                className="mb-4 h-60 overflow-y-auto border border-gray-200 rounded-md p-4 bg-gray-50"
              >
                {chatHistory.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Начните диалог с ИИ, чтобы создать блок-схему</p>
                  </div>
                ) : (
                  chatHistory.map((message, index) => (
                    <div 
                      key={index} 
                      className={`mb-3 ${message.role === 'user' ? 'text-right' : 'text-left'}`}
                    >
                      <div 
                        className={`inline-block max-w-[80%] p-3 rounded-lg ${
                          message.role === 'user' 
                            ? 'bg-blue-600 text-white rounded-tr-none' 
                            : 'bg-gray-200 text-gray-800 rounded-tl-none'
                        }`}
                      >
                        <div className="flex items-center mb-1">
                          {message.role === 'user' ? (
                            <>
                              <span className="font-medium">Вы</span>
                              <User className="w-4 h-4 ml-1" />
                            </>
                          ) : (
                            <>
                              <Bot className="w-4 h-4 mr-1" />
                              <span className="font-medium">ИИ</span>
                            </>
                          )}
                        </div>
                        <div className="whitespace-pre-wrap">
                          {message.content.includes('FLOWCHART:') ? (
                            <>
                              {message.content.split('FLOWCHART:')[0]}
                              <div className="bg-blue-100 p-2 rounded mt-1 text-gray-800">
                                Создана блок-схема на основе указанных шагов
                              </div>
                            </>
                          ) : message.content.includes('COMPLEX_FLOWCHART:') ? (
                            <>
                              {message.content.split('COMPLEX_FLOWCHART:')[0]}
                              <div className="bg-blue-100 p-2 rounded mt-1 text-gray-800">
                                Создана сложная блок-схема с указанными связями
                              </div>
                            </>
                          ) : (
                            message.content
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Chat Input */}
              <div className="flex">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Напишите вопрос или описание блок-схемы..."
                  className="flex-1 p-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={loading || !chatInput.trim()}
                  className="bg-blue-600 text-white p-2 rounded-r-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Flowchart Display Area (visible for both tabs) */}
          <div className="mt-8">
            <div ref={diagramRef} className="overflow-x-auto"/>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;