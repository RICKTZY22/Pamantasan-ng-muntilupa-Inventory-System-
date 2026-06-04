const addTextElement = (doc, parent, tag, text, className = '') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    node.textContent = String(text ?? '');
    parent.appendChild(node);
    return node;
};

export const openPrintPage = ({ title, styles, buildBody }) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return null;

    const { document: doc } = printWindow;
    doc.title = title;

    const style = doc.createElement('style');
    style.textContent = styles;
    doc.head.appendChild(style);

    buildBody(doc, doc.body, addTextElement);
    printWindow.focus();
    printWindow.print();
    return printWindow;
};
