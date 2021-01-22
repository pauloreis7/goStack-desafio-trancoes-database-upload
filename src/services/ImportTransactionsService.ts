import { getCustomRepository, getRepository, In } from 'typeorm'
import csvParse from 'csv-parse'
import fs from 'fs'

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionsRepository from '../repositories/TransactionsRepository'

interface CSVTransaction {
  title: string, 
  value: number, 
  type: 'income' | 'outcome', 
  category: string
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {

    const transactionsRepository = getCustomRepository(TransactionsRepository)
    const categoryRepository = getRepository(Category)

    const contactsReadStream = fs.createReadStream(filePath) //Criar Stream
    
    const parsers = csvParse({
      from_line: 2,
      ltrim: true,
      rtrim: true,
    }) // configuração do arquivo

    const parseCSV = contactsReadStream.pipe(parsers) // Ler linhas conforme são disponíveis

    let transactions: CSVTransaction[] = []
    let categories: string[] = []

    parseCSV.on('data', async line => {
      
      const [ title, type, value, category ] = line
      
      if( !title || !type || !value ) return

      categories.push(category)
      transactions.push({ title, type, value, category })
    })

    await new Promise(resolve => parseCSV.on('end', resolve ))

    const existentCategories = await categoryRepository.find({
      where: { 
        title: In(categories)
      }
    })
    const existentCategoriesTitle = existentCategories.map(category => category.title)

    const addCategoryTitles = categories
    .filter(category => !existentCategoriesTitle.includes(category))
    .filter((value, index, self) => self.indexOf(value) === index)

    const newCategories = categoryRepository.create(
      addCategoryTitles.map(title => ({ title }))
    )

    await categoryRepository.save(newCategories)

    const allCategories = [ ...newCategories, ...existentCategories ]

    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allCategories.find(
          category => category.title === transaction.category
        )
      }))
    )

    await transactionsRepository.save(createdTransactions)

    await fs.promises.unlink(filePath)

    return createdTransactions
  }
}

export default ImportTransactionsService;
