# UCX - Extensão VsCode para UnrealScript

Este projeto é um fork do UCX, adaptado e focado no desenvolvimento de **UnrealScript** para **Lineage 2**.

**Mantido por:** Majestic World Studio

## Créditos
Projeto original desenvolvido por [peterekepeter](https://github.com/peterekepeter/ucx).

## Funcionalidades

 - **Linguagem:**
    - Ir para definição (`Ctrl-Click`)
    - Encontrar símbolos (`Ctrl-P @`, `Ctrl-P #` ou `Ctrl-T`)
    - Suporte a dobramento (folding) para defaultproperties, states, labels, replication
    - Autocomplete (code completion)
    - Assinatura de funções
    - Hierarquia de classes (botão direito na classe > Show Type Hierarchy)
    - Encontrar todas as referências
    - Renomear símbolo (`F2`)
    - **Diagnóstico de Funções**: Identifica chamadas de funções inexistentes (sublinhado vermelho) e oferece **Quick Fix** para criá-las automaticamente.

 - **Formatador:**
    - Indentação automática
    - Espaçamento de operadores
    - Correção de maiúsculas/minúsculas em palavras-chave
    - Regras de espaçamento e novas linhas
    - Remoção de propriedades padrão redundantes
    - **Smart Backspace**: Apaga linhas inteiras de espaço vazio com um único `Backspace`.

 - **Diagnósticos:**
    - Detecção de erros de sintaxe
    - Completar ponto e vírgula
    - Verificação de funções indefinidas
    
 - **Geração de Arquivos:**
    - **Criar Classe (`Ctrl + Alt + N`)**: Cria rapidamente um novo arquivo `.uc` já com a estrutura básica, incluindo declaração `WindowHandle Me` e evento `OnLoad`.

 - **Importação de UI (Lineage 2 Interface):**
    - **Atalho `Alt + Insert`**: Abre lista de elementos do XML correspondente para importação rápida.
    - **Filtro Inteligente**: Lista apenas elementos que ainda não foram importados no código.
    - **Resolução de Conflitos**: Se o nome da variável já existir (de outro pai), renomeia automaticamente para `Nome_Pai`.
    - **Inserção Ordenada**: Mantém a organização do código, inserindo novas variáveis e inicializações logo após as existentes.
    - **Configuração Automática**: Detecta e salva o diretório dos arquivos XML do projeto.

 - **Destaque (Highlight):**
    - Gramática TextMate
    - Destaque de sintaxe semântico

**Aproveite!**
