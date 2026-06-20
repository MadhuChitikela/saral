// ================================================================
// JARGON DATABASE — Static lookup table (No training needed)
// ================================================================

const jargonDB = {
    // Electronics / Physics
    "capacitor": "Device that stores electrical energy in an electric field between two conducting plates.",
    "resistor": "Passive electrical component that opposes the flow of electric current.",
    "inductor": "Passive component that stores energy in a magnetic field when current flows through it.",
    "transistor": "Semiconductor device used to amplify or switch electrical signals and power.",
    "diode": "Semiconductor component that allows current to flow in only one direction.",
    "impedance": "Total opposition to alternating current (AC) flow in a circuit (resistance + reactance).",
    "reactance": "Opposition to AC current flow caused by capacitance or inductance.",
    
    // Mathematics
    "derivative": "The rate at which a function changes with respect to a variable; slope of tangent.",
    "integral": "The area under a curve; the reverse operation of differentiation.",
    "gradient": "A vector representing the direction and rate of fastest increase of a function.",
    "matrix": "A rectangular array of numbers arranged in rows and columns.",
    "vector": "A quantity possessing both magnitude and direction.",
    "entropy": "A measure of disorder, randomness, or uncertainty in a system.",

    // Computer Science / Software Engineering
    "algorithm": "A finite sequence of well-defined instructions to solve a problem.",
    "api": "Application Programming Interface — a set of rules for building and interacting with software.",
    "recursion": "A programming technique where a function calls itself to solve smaller sub-problems.",
    "polymorphism": "The ability to present the same interface for different underlying forms or data types.",
    "inheritance": "A mechanism where a child object or class acquires properties and behaviors of a parent.",
    "encapsulation": "The bundling of data with the methods that operate on that data, restricting direct access.",
    "latency": "The time delay between a request and a response in a system.",
    "throughput": "The amount of data processed or actions completed in a given time period.",
    "syntax": "The set of rules governing the structure and grammar of statements in a language.",
    "semantic": "Relating to meaning in language, code, or logic.",

    // AI & Machine Learning / Deep Learning
    "machine learning": "A field of AI focused on building systems that learn from data to improve performance.",
    "deep learning": "A subset of ML using multi-layered artificial neural networks (deep architectures).",
    "neural network": "A computing system loosely modeled on the biological brain, used in deep learning.",
    "transformer": "A neural network architecture that processes sequential data in parallel using self-attention, key to LLMs.",
    "token": "The smallest unit of text processed by a language model (word or sub-word).",
    "gradient descent": "An optimization algorithm used to minimize the error (loss) in a model by adjusting weights.",
    "backpropagation": "An algorithm that computes the gradient of the loss function with respect to weights, working backwards.",
    "overfitting": "When a model learns the training data too well, capturing noise and failing to generalize.",
    "underfitting": "When a model is too simple to capture the underlying pattern in the data.",
    "convolution": "A mathematical operation on two functions producing a third, used in CNNs to extract features.",
    "recurrent": "Networks with feedback loops (RNNs) enabling them to handle sequential and time-series data.",
    "embedding": "A dense vector representation representing words, phrases, or entities in a continuous space.",
    "fine-tuning": "Taking a pre-trained model and training it further on a smaller, task-specific dataset.",
    "inference": "The process of using a trained model to make predictions on new, unseen data.",
    "hyperparameter": "A configuration variable set before model training begins (e.g., learning rate).",
    "epoch": "One complete pass of the training algorithm through the entire dataset.",
    "batch": "A subset of the training dataset used to estimate gradients in a single training iteration.",
    "loss function": "A mathematical function measuring how far predictions are from the true values.",
    "activation function": "A function that introduces non-linearity into a neural network node (e.g., ReLU).",
    "dropout": "A regularization technique where random neurons are turned off during training to prevent overfitting.",
    "attention": "A mechanism that allows the model to focus on specific, relevant parts of the input sequence.",
    "clustering": "An unsupervised learning method that groups similar data points together.",
    "classification": "A supervised learning task of predicting discrete category labels for inputs.",
    "regression": "A supervised learning task of predicting continuous numerical values.",
    "reinforcement": "Machine learning focused on how agents take actions in an environment to maximize rewards."
};
