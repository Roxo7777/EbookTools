# 📚 EbookTools

![GitHub](https://img.shields.io/badge/license-MIT-blue.svg)![GitHub stars](https://img.shields.io/github/stars/Roxo7777/EbookTools?style=social)![GitHub issues](https://img.shields.io/github/issues/Roxo7777/EbookTools)![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow)![HTML5](https://img.shields.io/badge/HTML-5-orange)![CSS3](https://img.shields.io/badge/CSS-3-blue)

Bem-vindo ao **EbookTools**, sua suíte de ferramentas de código aberto para gerenciar, editar e aprimorar ebooks diretamente no navegador! 🚀 Inspirado na praticidade e estilo moderno do Discord, este projeto oferece uma interface intuitiva e personalizável para amantes de ebooks. Todas as operações são realizadas localmente no seu navegador, garantindo privacidade e segurança.

---

## ✨ Recursos

- **Redimensionar Capa**: Ajuste capas de EPUBs para dispositivos como Kindle, Kobo ou dimensões personalizadas.
- **Mudar Capa**: Substitua ou crie novas capas para seus ebooks com facilidade.
- **Traduzir Ebook** *(Simulação)*: Traduza conteúdos de EPUBs ou PDFs para diferentes idiomas.
- **Converter Ebook** *(Simulação)*: Converta ebooks entre formatos como EPUB e AZW3.
- **Inspecionar Ebook**: Explore e valide a estrutura interna de arquivos EPUB.
- **Minhas Anotações**: Importe e visualize anotações de dispositivos como Kindle.
- **Editar Sumário**: Reorganize e edite o sumário de EPUBs de forma interativa.
- **Histórico**: Acompanhe suas operações recentes.
- **Temas Personalizáveis**: Escolha entre temas como Discord, Café, Roxo, Branco, Vermelho, Verde e AMOLED, com suporte a modo escuro/claro.
- **Responsividade**: Interface otimizada para desktops e dispositivos móveis.
- **Real-time**: Integração com Socket.IO para atualizações em tempo real (ex.: progresso de conversão).

---

## 🖥️ Como Usar

1. **Acesse o Site**:

   - Abra `index.html` em um navegador moderno (Chrome, Firefox, Edge).
   - Você será redirecionado automaticamente para a página inicial (`home.html`).

2. **Navegue pelas Ferramentas**:

   - Use a barra lateral para selecionar ferramentas como "Redimensionar Capa" ou "Editar Sumário".
   - Arraste e solte arquivos EPUB ou selecione-os manualmente.

3. **Personalize o Tema**:

   - Escolha seu tema favorito (ex.: Discord, AMOLED) no seletor de temas na barra lateral.

4. **Pré-requisitos**:

   - Nenhum servidor backend é necessário para operações locais.
   - Para recursos em tempo real, configure um servidor Node.js com Socket.IO (veja a seção de instalação).

---

## 🛠️ Instalação

### Para Uso Local

1. Clone o repositório:

   ```bash
   git clone https://github.com/yourusername/ebooktools.git
   ```
2. Navegue até o diretório do projeto:

   ```bash
   cd ebooktools
   ```
3. Abra `index.html` em um navegador:
   - No Windows: `start index.html`
   - No macOS/Linux: `open index.html`

### Para Hospedagem (ex.: GitHub Pages)

1. Crie um repositório no GitHub e faça upload dos arquivos.
2. Ative o GitHub Pages nas configurações do repositório, selecionando a branch `main` e a pasta `/` (raiz).
3. Acesse o site em `https://yourusername.github.io/ebooktools`.

### Para Recursos Real-time (Opcional)

1. Instale o Node.js e npm.
2. Configure um servidor Socket.IO:

   ```bash
   npm init -y
   npm install express socket.io
   ```
3. Crie um arquivo `server.js`:

   ```javascript
   const express = require('express');
   const { Server } = require('socket.io');
   const app = express();
   const server = require('http').createServer(app);
   const io = new Server(server);
   
   app.use(express.static('.'));
   
   io.on('connection', (socket) => {
       console.log('Usuário conectado:', socket.id);
       socket.on('disconnect', () => console.log('Usuário desconectado:', socket.id));
   });
   
   server.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));
   ```
4. Inicie o servidor:

   ```bash
   node server.js
   ```

---

## 📂 Estrutura do Projeto

```plaintext
ebooktools/
├── index.html        # Página inicial com redirecionamento
├── home.html         # Página principal com visão geral das ferramentas
├── resizer.html      # Ferramenta de redimensionamento de capas
├── styles.css        # Estilos globais com temas personalizáveis
├── resizer.css       # Estilos específicos para a ferramenta de redimensionamento
├── main.css          # Estilos adicionais para layout e debug
├── scripts.js        # Lógica principal com suporte a JSZip, Pica, PDF.js e Socket.IO
└── README.md         # Documentação do projeto
```

---

## 🧩 Tecnologias Utilizadas

- **HTML5**: Estrutura semântica e acessível.
- **CSS3**: Temas dinâmicos e responsividade.
- **JavaScript (ES6+)**: Manipulação de EPUBs e interatividade.
- **jQuery**: Simplifica manipulação do DOM.
- **Socket.IO**: Suporte a atualizações em tempo real.
- **JSZip**: Manipulação de arquivos EPUB.
- **Pica**: Redimensionamento de imagens.
- **PDF.js**: Visualização de PDFs (usado em ferramentas de inspeção).

---

## 🌟 Contribua

Quer ajudar a melhorar o EbookTools? Sinta-se à vontade para contribuir!

1. Faça um fork do repositório.
2. Crie uma branch para sua feature:

   ```bash
   git checkout -b minha-nova-feature
   ```
3. Faça commit das suas alterações:

   ```bash
   git commit -m "Adiciona minha nova feature"
   ```
4. Envie para o repositório remoto:

   ```bash
   git push origin minha-nova-feature
   ```
5. Abra um Pull Request no GitHub.

---

## 📜 Licença

Este projeto é licenciado sob a Licença MIT. Sinta-se livre para usar, modificar e compartilhar!
