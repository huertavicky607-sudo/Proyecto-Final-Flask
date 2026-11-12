/* MENU RESPONSIVE */
let overlay = document.querySelector('#overlay');
let menuHamburger = document.querySelector('.menu-hamburger');
let menuResponsive = document.querySelector('.menu-responsive');
let menuClose = document.querySelector('.btn-close-responsive');

if (menuHamburger) {
    menuHamburger.addEventListener('click', () => {
        menuResponsive.classList.add('active');
        if (overlay) overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
    });
}

if (menuClose) {
    menuClose.addEventListener("click", () => {
        menuResponsive.classList.remove('active');
        if (overlay) overlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    });
}

/* ACORDEON */
const acordeonButtons = document.querySelectorAll('.acordeon-button');

acordeonButtons.forEach(button => {
    button.addEventListener('click', function() {
        const icon = this.querySelector('i');
        if (icon) {
            if (icon.classList.contains('fa-plus')) {
                icon.classList.remove('fa-plus');
                icon.classList.add('fa-minus');
            } else { 
                icon.classList.remove('fa-minus');
                icon.classList.add('fa-plus');
            }
        }
        this.classList.toggle('active');
        const content = this.nextElementSibling;

        if (content) {
            if (content.style.height) {
                content.style.height = null;
                content.style.padding = '0px';
            } else {
                const padding = 20;
                content.style.height = content.scrollHeight + padding * 2 + 'px';
                content.style.padding = `${padding}px`;
            }
        }
    });
});

/* CARD PAYMENT & INTERACTION */
const valueColor = document.querySelector('#value-color');
const colorButtons = document.querySelectorAll('.container-color');

colorButtons.forEach(button => {
    button.addEventListener('click', e => {
        colorButtons.forEach(btn => btn.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        const color = e.target.dataset.color;
        if (valueColor) valueColor.innerText = color;
    });
});

const valueSize = document.querySelector('#value-size');
const sizeButtons = document.querySelectorAll('.btn-size');

sizeButtons.forEach(button => {
    button.addEventListener('click', e => {
        sizeButtons.forEach(btn => btn.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        const size = e.target.textContent;
        if (valueSize) valueSize.innerText = size;
    });
});

const btnIncrement = document.querySelector('#btn-increment');
const btnDecrement = document.querySelector('#btn-decrement');
const countProduct = document.querySelector('#count-product');
const totalProductsCart = document.querySelector('.count-products-cart');
const btnAddToCart = document.querySelector('.btn-add-to-cart');
const priceProduct = document.querySelector('.price');
const quantityProduct = document.querySelector('#quantity-product');
const totalPrice = document.querySelector('.price-total');
const valueContainer = document.querySelector('.value');
const totalValue = valueContainer ? valueContainer.querySelector('p') : null;

const updateButtonState = () => {
    if (btnDecrement && countProduct) {
        if (parseInt(countProduct.textContent) <= 1) {
            btnDecrement.disabled = true;
        } else {
            btnDecrement.disabled = false;
        }
    }
};

const updateValueQuantity = () => {
    if (countProduct && priceProduct && quantityProduct && totalValue && totalPrice) {
        let quantity = parseInt(countProduct.textContent);
        let price = parseInt(priceProduct.textContent.replace('$', ''));
        let total = `$${quantity * price}.00`;
        quantityProduct.textContent = quantity;
        totalValue.textContent = total;
        totalPrice.textContent = total;
    }
};

if (btnIncrement) {
    btnIncrement.addEventListener('click', () => {
        countProduct.textContent = parseInt(countProduct.textContent) + 1;
        updateButtonState();
        updateValueQuantity();
    });
}

if (btnDecrement) {
    btnDecrement.addEventListener('click', () => {
        countProduct.textContent = parseInt(countProduct.textContent) - 1;
        updateButtonState();
        updateValueQuantity();
    });
}

if (btnAddToCart && totalProductsCart && countProduct) {
    btnAddToCart.addEventListener('click', () => {
        totalProductsCart.textContent = parseInt(totalProductsCart.textContent) + parseInt(countProduct.textContent);
        countProduct.textContent = 1;
        updateButtonState();
    });
}

updateButtonState();
