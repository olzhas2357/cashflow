import csv
import json

def csv_to_json(csv_file_path, json_file_path):
    data = []
    
    # Открываем CSV файл
    # utf-8-sig помогает, если файл сохранен в Excel со спецсимволами (BOM)
    with open(csv_file_path, encoding='utf-8-sig') as csvf:
        # Читаем CSV как словарь, где ключи — это заголовки столбцов
        csv_reader = csv.DictReader(csvf)
        
        for rows in csv_reader:
            # Создаем чистый объект с удобными именами ключей
            entry = {
                "type_of_market": rows['type of market'].strip(),
                "text_comment": rows['comment'].strip()
            }
            data.append(entry)

    # Сохраняем в JSON с отступами для читаемости
    with open(json_file_path, 'w', encoding='utf-8') as jsonf:
        json.dump(data, jsonf, indent=2, ensure_ascii=False)

# Запуск
csv_to_json('market.csv', 'market.json')
print("Готово! Проверьте файл market.json")